import { normalizePlan } from './plan'
import {
  ResourceRun,
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
    const run = new ResourceRun(this.plan, this.options)
    const groups = normalizePlan(this.plan)
    run.setSnapshot(createRunningRunSnapshot(groups))
    void this.execute(run, groups)
    return run
  }

  private async execute(
    run: ResourceRun,
    groups: NormalizedGroup[],
  ): Promise<void> {
    const groupPromises = groups.map((group) => this.executeGroup(run, group))
    await Promise.allSettled(groupPromises)
    this.completeRun(run)
  }

  private async executeGroup(
    run: ResourceRun,
    group: NormalizedGroup,
  ): Promise<void> {
    this.markGroupStarted(run, group.key)

    for (const item of group.items) {
      await this.executeItem(run, group, item)
      if (run.getSnapshot().status === 'failed') {
        return
      }
    }

    this.markGroupSucceeded(run, group.key)
  }

  private async executeItem(
    run: ResourceRun,
    group: NormalizedGroup,
    item: NormalizedItem,
  ): Promise<void> {
    const startedAt = Date.now()
    const activeItem = createActiveItemSnapshot(item, startedAt)
    const loader = this.getLoader(item.type)

    this.updateSnapshot(run, (snapshot) => ({
      ...snapshot,
      activeItems: [...snapshot.activeItems, activeItem],
    }))

    try {
      await loader(item, { signal: createAbortSignal() })
      this.updateSnapshot(run, (snapshot) => {
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
          activeItems: snapshot.activeItems.filter(
            (snapshotItem) => snapshotItem.key !== item.key,
          ),
          progress: this.calculateProgress(nextGroups),
        }
      })
      this.updateRunStatus(run)
    } catch (cause) {
      const failure = createResourceFailure(item, cause, 1)
      const endedAt = Date.now()

      this.updateSnapshot(run, (snapshot) => ({
        ...snapshot,
        status: 'failed',
        endedAt,
        groups: snapshot.groups.map((snapshotGroup) =>
          snapshotGroup.key === group.key
            ? {
                ...snapshotGroup,
                status: 'failed',
                endedAt,
              }
            : snapshotGroup,
        ),
        activeItems: snapshot.activeItems.filter(
          (snapshotItem) => snapshotItem.key !== item.key,
        ),
        errors: [...snapshot.errors, failure],
      }))
      this.failRun(run, new ResourceRunError('Blocking groups failed'))
    }
  }

  private markGroupStarted(run: ResourceRun, groupKey: string): void {
    const startedAt = Date.now()
    this.updateSnapshot(run, (snapshot) => ({
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

  private markGroupSucceeded(run: ResourceRun, groupKey: string): void {
    this.updateSnapshot(run, (snapshot) => {
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
    this.updateRunStatus(run)
  }

  private completeRun(run: ResourceRun): void {
    this.updateSnapshot(run, (snapshot) => {
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

    const snapshot = run.getSnapshot()

    if (!run.isReadySettled()) {
      run.resolveReady(createReadyResult(snapshot))
    }
    if (!run.isCompleteSettled()) {
      run.resolveComplete(createCompleteResult(snapshot))
    }
  }

  private failRun(run: ResourceRun, error: ResourceRunError): void {
    if (!run.isReadySettled()) {
      run.rejectReady(error)
    }
    if (!run.isCompleteSettled()) {
      run.rejectComplete(error)
    }
  }

  private updateRunStatus(run: ResourceRun): void {
    const snapshot = run.getSnapshot()
    const blockingGroups = snapshot.groups.filter((group) => group.blocking)
    const allBlockingReady = blockingGroups.every(
      (group) => group.status === 'ready' || group.status === 'completed',
    )
    const anyBlockingFailed = blockingGroups.some(
      (group) => group.status === 'failed',
    )

    if (anyBlockingFailed) {
      this.failRun(run, new ResourceRunError('Blocking groups failed'))
      return
    }

    if (allBlockingReady && snapshot.status === 'running') {
      this.updateSnapshot(run, (currentSnapshot) => ({
        ...currentSnapshot,
        status: 'ready',
      }))
      if (!run.isReadySettled()) {
        run.resolveReady(createReadyResult(run.getSnapshot()))
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
    run: ResourceRun,
    updater: (snapshot: ResourceRunSnapshot) => ResourceRunSnapshot,
  ): void {
    run.setSnapshot(updater(run.getSnapshot()))
  }
}
