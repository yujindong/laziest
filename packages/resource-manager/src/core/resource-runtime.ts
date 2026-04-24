import { normalizePlan } from './plan'
import {
  ResourceRun,
  type ResourceRunController,
  createResourceRunController,
  createCompleteResult,
  createIdleRunSnapshot,
  createReadyResult,
} from './resource-run'
import { ResourceRunError, createResourceFailure } from './errors'
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
} from '../shared/types'
import { normalizeResourcePlan } from '../shared/types'

const TERMINAL_GROUP_STATUSES = new Set(['completed', 'failed', 'skipped'])

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

function createAbortSignal(): AbortSignal {
  const controller = new AbortController()
  return controller.signal
}

function createDefaultRuntimeLoader(): ResourceRuntimeLoader {
  return async () => undefined
}

export { ResourceRun } from './resource-run'

export class ResourceRuntime {
  readonly plan: ResourcePlan
  readonly options: ResourceRuntimeOptions

  constructor(
    plan: ResourcePlan,
    options: ResourceRuntimeOptions = {},
  ) {
    this.plan = normalizeResourcePlan(plan)
    this.options = options
  }

  start(): ResourceRun {
    const controller = createResourceRunController(this.plan, this.options)
    const groups = normalizePlan(this.plan)
    controller.setSnapshot(createRunningRunSnapshot(groups))
    this.updateRunStatus(controller)
    void this.execute(controller, groups)
    return controller.run
  }

  private async execute(
    controller: ResourceRunController,
    groups: NormalizedGroup[],
  ): Promise<void> {
    const groupResults = await Promise.allSettled(
      groups.map((group) => this.executeGroup(controller, group)),
    )
    const rejectedResult = groupResults.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    )

    if (rejectedResult) {
      this.failRun(controller, rejectedResult.reason)
      return
    }

    this.completeRun(controller)
  }

  private async executeGroup(
    controller: ResourceRunController,
    group: NormalizedGroup,
  ): Promise<void> {
    this.markGroupStarted(controller, group.key)

    for (const item of group.items) {
      const itemSucceeded = await this.executeItem(controller, group, item)
      if (!itemSucceeded) {
        return
      }

      if (controller.getSnapshot().status === 'failed') {
        return
      }
    }

    this.markGroupSucceeded(controller, group.key)
  }

  private async executeItem(
    controller: ResourceRunController,
    group: NormalizedGroup,
    item: NormalizedItem,
  ): Promise<boolean> {
    const startedAt = Date.now()
    const activeItem = createActiveItemSnapshot(item, startedAt)
    const loader = this.getLoader(item.type)

    this.updateSnapshot(controller, (snapshot) => ({
      ...snapshot,
      activeItems: [...snapshot.activeItems, activeItem],
    }))

    try {
      await loader(item, { signal: createAbortSignal() })
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
      const failure = createResourceFailure(item, cause, 1)
      const endedAt = Date.now()

      this.updateSnapshot(controller, (snapshot) => ({
        ...snapshot,
        groups: snapshot.groups.map((snapshotGroup) =>
          snapshotGroup.key === group.key
            ? {
                ...snapshotGroup,
                status: 'failed',
                endedAt,
              }
            : snapshotGroup,
        ),
        activeItems: this.removeActiveItem(snapshot.activeItems, item),
        errors: [...snapshot.errors, failure],
      }))

      if (group.blocking) {
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
    }
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
      if (snapshot.status === 'failed') {
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
