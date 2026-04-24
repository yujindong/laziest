import { normalizePlan } from './plan'
import { resolveCachedValue, writeCacheValue } from './cache'
import { buildPrioritySchedulingUnits } from './scheduler'
import { createLoaderRegistry } from '../loaders'
import {
  ResourceRun,
  type ResourceRunController,
  createResourceRunController,
  createCompleteResult,
  createIdleRunSnapshot,
  createReadyResult,
} from './resource-run'
import {
  ResourceRunError,
  createResourceFailure,
  createResourceSkippedWarning,
} from './errors'
import { runWithRetry } from './retry'
import { runWithConcurrency } from '../shared/queue'
import type {
  NormalizedGroup,
  NormalizedItem,
  ResourcePlan,
  ResourceRunActiveItemSnapshot,
  ResourceRunGroupSnapshot,
  ResourceRunGroupStatus,
  ResourceRunSnapshot,
  ResourceRuntimeLoader,
  ResourceRuntimeLoaderRegistry,
  ResourceRuntimeOptions,
  ResourceBucketName,
  ResourceLoaderKey,
  NormalizedResourceItem,
} from '../shared/types'
import { normalizeResourcePlan } from '../shared/types'

const TERMINAL_GROUP_STATUSES = new Set(['completed', 'failed', 'skipped'])

type InRunLoadCache = Map<string, Promise<void>>

function createRunGroupSnapshot(group: NormalizedGroup): ResourceRunGroupSnapshot {
  return {
    key: group.key,
    blocking: group.blocking,
    priority: group.priority,
    totalItems: group.items.length,
    completedItems: 0,
    status: 'queued',
    startedAt: null,
    endedAt: null,
  }
}

function createRunningRunSnapshot(groups: NormalizedGroup[]): ResourceRunSnapshot {
  const startedAt = Date.now()

  return {
    ...createIdleRunSnapshot(),
    status: 'running',
    startedAt,
    groups: groups.map(createRunGroupSnapshot),
  }
}

function createActiveItemSnapshot(
  item: NormalizedItem,
  startedAt: number,
): ResourceRunActiveItemSnapshot {
  return {
    key: item.key,
    groupKey: item.groupKey,
    url: item.url,
    type: item.type,
    startedAt,
  }
}

function createDefaultRuntimeLoader(): ResourceRuntimeLoader {
  const loaders = createLoaderRegistry()

  return async (item, context) => {
    return await loaders[item.type](createBrowserLoaderItem(item), context)
  }
}

function getBucketName(type: NormalizedItem['type']): ResourceBucketName {
  switch (type) {
    case 'image':
      return 'images'
    case 'font':
      return 'fonts'
    case 'audio':
      return 'audio'
    case 'video':
      return 'video'
    case 'lottie':
      return 'lottie'
    case 'json':
      return 'json'
    case 'text':
      return 'text'
    case 'binary':
      return 'binary'
  }
}

function createBrowserLoaderItem(item: NormalizedItem): NormalizedResourceItem {
  const source = {
    url: item.url,
    optional: item.optional,
    ...('family' in item ? { family: item.family } : {}),
    ...('descriptors' in item ? { descriptors: item.descriptors } : {}),
    ...('preload' in item ? { preload: item.preload } : {}),
    ...('crossOrigin' in item ? { crossOrigin: item.crossOrigin } : {}),
    ...('requestInit' in item ? { requestInit: item.requestInit } : {}),
  }

  return {
    id: item.key,
    bucket: getBucketName(item.type),
    type: item.type,
    loaderKey: item.type as ResourceLoaderKey,
    url: item.url,
    optional: item.optional,
    dedupeKey: item.dedupeKey,
    source,
    ...('family' in item ? { family: item.family } : {}),
    ...('descriptors' in item ? { descriptors: item.descriptors } : {}),
    ...('preload' in item ? { preload: item.preload } : {}),
    ...('crossOrigin' in item ? { crossOrigin: item.crossOrigin } : {}),
    ...('requestInit' in item ? { requestInit: item.requestInit } : {}),
  }
}

function createAbortError(): DOMException | Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('Aborted', 'AbortError')
  }

  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

function isResourceFailure(value: unknown): value is ReturnType<typeof createResourceFailure> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'category' in value &&
    'code' in value &&
    'attempt' in value
  )
}

function isTerminalRunStatus(status: ResourceRunSnapshot['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'aborted'
}

export { ResourceRun } from './resource-run'

export class ResourceRuntime {
  readonly plan: ResourcePlan
  readonly options: ResourceRuntimeOptions
  private run?: ResourceRun

  constructor(
    plan: ResourcePlan,
    options: ResourceRuntimeOptions = {},
  ) {
    this.plan = normalizeResourcePlan(plan)
    this.options = options
  }

  start(): ResourceRun {
    if (this.run) {
      return this.run
    }

    const controller = createResourceRunController(this.plan, this.options)
    const groups = normalizePlan(this.plan)
    const runAbortController = new AbortController()
    const activeItemControllers = new Set<AbortController>()
    this.run = controller.run

    controller.setAbortHandler(() => {
      const status = controller.getSnapshot().status
      if (isTerminalRunStatus(status)) {
        return
      }

      if (runAbortController.signal.aborted) {
        return
      }

      const reason = createAbortError()
      runAbortController.abort(reason)
      for (const activeController of activeItemControllers) {
        activeController.abort(reason)
      }
      this.abortRun(controller, new ResourceRunError('Resource runtime aborted'))
    })
    controller.setSnapshot(createRunningRunSnapshot(groups))
    this.updateRunStatus(controller)
    void this.execute(
      controller,
      groups,
      runAbortController.signal,
      activeItemControllers,
    )
    return controller.run
  }

  getRun(): ResourceRun {
    return this.run ?? this.start()
  }

  private async execute(
    controller: ResourceRunController,
    groups: NormalizedGroup[],
    signal: AbortSignal,
    activeItemControllers: Set<AbortController>,
  ): Promise<void> {
    const loadCache: InRunLoadCache = new Map()
    const groupsByKey = new Map(groups.map((group) => [group.key, group]))
    const failedGroups = new Set<string>()
    const schedulingUnits = buildPrioritySchedulingUnits(groups)

    await runWithConcurrency(
      schedulingUnits,
      this.options.maxConcurrentItems ?? 1,
      async ({ item }) => {
        if (
          signal.aborted ||
          isTerminalRunStatus(controller.getSnapshot().status) ||
          failedGroups.has(item.groupKey)
        ) {
          return
        }

        const group = groupsByKey.get(item.groupKey)

        if (!group) {
          return
        }

        this.markGroupStarted(controller, group.key)

        const itemSucceeded = await this.executeItem(
          controller,
          group,
          item,
          signal,
          activeItemControllers,
          loadCache,
        )
        if (!itemSucceeded) {
          failedGroups.add(group.key)
          return
        }

        const snapshotGroup = controller
          .getSnapshot()
          .groups.find((candidate) => candidate.key === group.key)

        if (
          snapshotGroup &&
          snapshotGroup.completedItems === snapshotGroup.totalItems
        ) {
          this.markGroupSucceeded(controller, group.key)
        }
      },
    )

    if (isTerminalRunStatus(controller.getSnapshot().status)) {
      return
    }

    this.completeRun(controller)
  }

  private async executeItem(
    controller: ResourceRunController,
    group: NormalizedGroup,
    item: NormalizedItem,
    signal: AbortSignal,
    activeItemControllers: Set<AbortController>,
    loadCache: InRunLoadCache,
  ): Promise<boolean> {
    const startedAt = Date.now()
    const activeItem = createActiveItemSnapshot(item, startedAt)
    const itemAbortController = new AbortController()

    const relayAbort = () =>
      itemAbortController.abort(signal.reason ?? createAbortError())

    if (signal.aborted) {
      itemAbortController.abort(signal.reason ?? createAbortError())
    } else {
      signal.addEventListener('abort', relayAbort, { once: true })
    }

    this.updateSnapshot(controller, (snapshot) => ({
      ...snapshot,
      activeItems: [...snapshot.activeItems, activeItem],
    }))
    activeItemControllers.add(itemAbortController)

    try {
      await this.loadItemOnce(item, itemAbortController, loadCache)
      this.updateSnapshot(controller, (snapshot) => {
        const nextGroups = snapshot.groups.map((snapshotGroup) =>
          snapshotGroup.key === group.key
            ? {
                ...snapshotGroup,
                completedItems: snapshotGroup.completedItems + 1,
              }
            : snapshotGroup,
        )

        return {
          ...snapshot,
          groups: nextGroups,
          activeItems: this.removeActiveItem(snapshot.activeItems, item),
          progress: this.calculateProgress(nextGroups),
        }
      })
      this.updateRunStatus(controller)
      return true
    } catch (cause) {
      if (signal.aborted || controller.getSnapshot().status === 'aborted') {
        return false
      }

      const failure = isResourceFailure(cause)
        ? cause
        : createResourceFailure(item, cause, 1)
      const endedAt = Date.now()
      const isOptionalFailure = item.optional

      this.updateSnapshot(controller, (snapshot) => ({
        ...snapshot,
        groups: snapshot.groups.map((snapshotGroup) =>
          snapshotGroup.key === group.key
            ? {
                ...snapshotGroup,
                status: isOptionalFailure ? snapshotGroup.status : 'failed',
                completedItems: isOptionalFailure
                  ? snapshotGroup.completedItems + 1
                  : snapshotGroup.completedItems,
                endedAt: isOptionalFailure ? snapshotGroup.endedAt : endedAt,
              }
            : snapshotGroup,
        ),
        activeItems: this.removeActiveItem(snapshot.activeItems, item),
        errors: [...snapshot.errors, failure],
        warnings: isOptionalFailure
          ? [...snapshot.warnings, createResourceSkippedWarning(failure)]
          : snapshot.warnings,
      }))

      if (isOptionalFailure) {
        const snapshotGroup = controller
          .getSnapshot()
          .groups.find((candidate) => candidate.key === group.key)

        if (
          snapshotGroup &&
          snapshotGroup.completedItems === snapshotGroup.totalItems
        ) {
          this.markGroupSucceeded(controller, group.key)
        } else {
          this.updateRunStatus(controller)
        }
      } else if (group.blocking) {
        this.updateSnapshot(controller, (snapshot) => ({
          ...snapshot,
          status: 'failed',
          endedAt: snapshot.endedAt ?? endedAt,
        }))
        this.failRun(controller, new ResourceRunError('Blocking groups failed'))
      } else {
        this.updateRunStatus(controller)
      }

      return false
    } finally {
      signal.removeEventListener('abort', relayAbort)
      activeItemControllers.delete(itemAbortController)
    }
  }

  private loadItemOnce(
    item: NormalizedItem,
    controller: AbortController,
    loadCache: InRunLoadCache,
  ): Promise<void> {
    const existingLoad = loadCache.get(item.dedupeKey)

    if (existingLoad) {
      return existingLoad
    }

    const load = this.loadItemWithCacheAndRetry(item, controller)
    loadCache.set(item.dedupeKey, load)
    return load
  }

  private async loadItemWithCacheAndRetry(
    item: NormalizedItem,
    controller: AbortController,
  ): Promise<void> {
    const cached = await resolveCachedValue(this.options.cache, item)

    if (cached !== undefined) {
      return
    }

    const loader = this.getLoader(item.type)

    const value = await runWithRetry(
      () =>
        loader(item, {
          signal: controller.signal,
          onProgress: (transfer) => {
            this.markItemProgress(item, transfer)
          },
        }),
      {
        retry: this.options.retry,
        signal: controller.signal,
        createFailure: (cause, attempt) =>
          createResourceFailure(item, cause, attempt),
      },
    )

    await writeCacheValue(this.options.cache, item, value)
  }

  private markItemProgress(
    _item: NormalizedItem,
    _transfer: unknown,
  ): void {
    // Runtime snapshots do not expose per-item transfer details yet.
  }

  private markGroupStarted(
    controller: ResourceRunController,
    groupKey: string,
  ): void {
    const startedAt = Date.now()
    this.updateSnapshot(controller, (snapshot) => ({
      ...snapshot,
      groups: snapshot.groups.map((group) =>
        group.key === groupKey
          ? {
              ...group,
              status: 'running',
              startedAt: group.startedAt ?? startedAt,
            }
          : group,
      ),
    }))
  }

  private markGroupSucceeded(
    controller: ResourceRunController,
    groupKey: string,
  ): void {
    this.updateSnapshot(controller, (snapshot) => {
      const nextGroups = snapshot.groups.map((group) => {
        if (group.key !== groupKey) {
          return group
        }

        const allGroupsTerminalOrReady = snapshot.groups.every((candidate) =>
          candidate.key === groupKey
            ? true
            : TERMINAL_GROUP_STATUSES.has(candidate.status) ||
              candidate.status === 'ready',
        )
        const nextStatus: ResourceRunGroupStatus =
          group.blocking && !allGroupsTerminalOrReady ? 'ready' : 'completed'

        return {
          ...group,
          status: nextStatus,
          endedAt: Date.now(),
        }
      })

      return {
        ...snapshot,
        groups: nextGroups,
        progress: this.calculateProgress(nextGroups),
      }
    })
    this.updateRunStatus(controller)
  }

  private completeRun(controller: ResourceRunController): void {
    this.updateSnapshot(controller, (snapshot) => {
      if (snapshot.status === 'failed' || snapshot.status === 'aborted') {
        return snapshot
      }

      const endedAt = Date.now()
      const nextGroups = snapshot.groups.map((group) =>
        group.status === 'ready'
          ? {
              ...group,
              status: 'completed' as const,
              endedAt: group.endedAt ?? endedAt,
            }
          : group,
      )

      return {
        ...snapshot,
        status: 'completed',
        endedAt,
        groups: nextGroups,
        progress: this.calculateProgress(nextGroups),
      }
    })

    const snapshot = controller.getSnapshot()

    if (!controller.isReadySettled()) {
      controller.resolveReady(createReadyResult(snapshot))
    }
    if (!controller.isCompleteSettled()) {
      controller.resolveComplete(createCompleteResult(snapshot))
    }
  }

  private failRun(
    controller: ResourceRunController,
    cause: unknown,
  ): void {
    const endedAt = Date.now()

    this.updateSnapshot(controller, (snapshot) => ({
      ...snapshot,
      status: 'failed',
      endedAt: snapshot.endedAt ?? endedAt,
    }))

    const error =
      cause instanceof ResourceRunError
        ? cause
        : new ResourceRunError('Resource runtime failed')

    if (!controller.isReadySettled()) {
      controller.rejectReady(error)
    }
    if (!controller.isCompleteSettled()) {
      controller.rejectComplete(error)
    }
  }

  private abortRun(
    controller: ResourceRunController,
    error: ResourceRunError,
  ): void {
    const endedAt = Date.now()

    this.updateSnapshot(controller, (snapshot) => ({
      ...snapshot,
      status: 'aborted',
      endedAt: snapshot.endedAt ?? endedAt,
      activeItems: [],
    }))

    if (!controller.isReadySettled()) {
      controller.rejectReady(error)
    }
    if (!controller.isCompleteSettled()) {
      controller.rejectComplete(error)
    }
  }

  private updateRunStatus(controller: ResourceRunController): void {
    const snapshot = controller.getSnapshot()
    const blockingGroups = snapshot.groups.filter((group) => group.blocking)
    const allBlockingReady = blockingGroups.every(
      (group) => group.status === 'ready' || group.status === 'completed',
    )
    const anyBlockingFailed = blockingGroups.some(
      (group) => group.status === 'failed',
    )

    if (anyBlockingFailed) {
      this.failRun(controller, new ResourceRunError('Blocking groups failed'))
      return
    }

    if (allBlockingReady && snapshot.status === 'running') {
      this.updateSnapshot(controller, (currentSnapshot) => ({
        ...currentSnapshot,
        status: 'ready',
        readyAt: currentSnapshot.readyAt ?? Date.now(),
      }))
      if (!controller.isReadySettled()) {
        controller.resolveReady(createReadyResult(controller.getSnapshot()))
      }
    }
  }

  private calculateProgress(groups: ResourceRunGroupSnapshot[]): number {
    const totalItems = groups.reduce((total, group) => total + group.totalItems, 0)

    if (totalItems === 0) {
      return 0
    }

    const completedItems = groups.reduce(
      (total, group) => total + group.completedItems,
      0,
    )

    return completedItems / totalItems
  }

  private getLoader(type: NormalizedItem['type']): ResourceRuntimeLoader {
    const loaders = this.options.loaders as
      | Partial<ResourceRuntimeLoaderRegistry>
      | undefined

    return loaders?.[type] ?? createDefaultRuntimeLoader()
  }

  private updateSnapshot(
    controller: ResourceRunController,
    updater: (snapshot: ResourceRunSnapshot) => ResourceRunSnapshot,
  ): void {
    controller.setSnapshot(updater(controller.getSnapshot()))
  }

  private removeActiveItem(
    activeItems: ResourceRunActiveItemSnapshot[],
    item: NormalizedItem,
  ): ResourceRunActiveItemSnapshot[] {
    return activeItems.filter(
      (snapshotItem) =>
        !(
          snapshotItem.key === item.key &&
          snapshotItem.groupKey === item.groupKey
        ),
    )
  }
}
