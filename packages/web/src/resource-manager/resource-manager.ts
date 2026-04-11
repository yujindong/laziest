import type {
  NormalizedResourceItem,
  ResourceBuckets,
  ResourceLoaderRegistry,
  ResourceManagerOptions,
  ResourceManagerSnapshot,
  ResourceItemSnapshot,
  CompletedPreloadResult,
  FailedPreloadResult,
} from './types'
import {
  createNormalizedResourceSignature,
  normalizeResourceBuckets,
} from './normalize'
import {
  createResourceFailure,
  createResourceSkippedWarning,
  ResourcePreloadError,
} from './errors'
import {
  getRetryDelayMs,
  shouldRetryFailure,
  waitForRetryDelay,
} from './retry'

function createIdleSnapshot(): ResourceManagerSnapshot {
  return {
    status: 'idle',
    startedAt: null,
    endedAt: null,
    total: 0,
    queued: 0,
    loading: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    completed: 0,
    progress: 0,
    activeItems: [],
    recentlyCompleted: [],
    errors: [],
    warnings: [],
  }
}

function createDefaultLoaders(): ResourceLoaderRegistry {
  const noop = async () => undefined

  return {
    image: noop,
    font: noop,
    audio: noop,
    video: noop,
    lottie: noop,
    json: noop,
    text: noop,
    binary: noop,
  }
}

function cloneItemSnapshot(item: ResourceItemSnapshot): ResourceItemSnapshot {
  return {
    ...item,
    transfer: item.transfer ? { ...item.transfer } : undefined,
    error: item.error ? { ...item.error } : undefined,
  }
}

function createItemSnapshot(
  item: NormalizedResourceItem,
  status: ResourceItemSnapshot['status'],
  startedAt: number | null,
  endedAt: number | null,
  attempt: number,
): ResourceItemSnapshot {
  return {
    id: item.id,
    url: item.url,
    type: item.type,
    status,
    attempt,
    startedAt,
    endedAt,
    duration:
      startedAt !== null && endedAt !== null ? endedAt - startedAt : null,
    fromCache: false,
  }
}

function cloneSnapshot(snapshot: ResourceManagerSnapshot): ResourceManagerSnapshot {
  return {
    ...snapshot,
    activeItems: snapshot.activeItems.map(cloneItemSnapshot),
    recentlyCompleted: snapshot.recentlyCompleted.map(cloneItemSnapshot),
    errors: snapshot.errors.map((error) => ({ ...error })),
    warnings: snapshot.warnings.map((warning) => ({ ...warning })),
  }
}

function createRunningSnapshot(
  total: number,
  startedAt: number,
): ResourceManagerSnapshot {
  return {
    status: 'running',
    startedAt,
    endedAt: null,
    total,
    queued: total,
    loading: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    completed: 0,
    progress: 0,
    activeItems: [],
    recentlyCompleted: [],
    errors: [],
    warnings: [],
  }
}

function createPreloadResult(
  snapshot: ResourceManagerSnapshot & { status: 'completed' },
  startedAt: number,
  endedAt: number,
): CompletedPreloadResult {
  return {
    status: 'completed',
    total: snapshot.total,
    succeeded: snapshot.succeeded,
    failed: snapshot.failed,
    skipped: snapshot.skipped,
    duration: endedAt - startedAt,
    items: snapshot.recentlyCompleted.map(cloneItemSnapshot),
    errors: snapshot.errors.map((error) => ({ ...error })),
    warnings: snapshot.warnings.map((warning) => ({ ...warning })),
  }
}

function updateActiveItemSnapshot(
  snapshot: ResourceManagerSnapshot,
  itemSnapshot: ResourceItemSnapshot,
): ResourceManagerSnapshot {
  return {
    ...snapshot,
    activeItems: snapshot.activeItems.map((active) =>
      active.id === itemSnapshot.id ? itemSnapshot : active,
    ),
  }
}

function appendCompletedItem(
  snapshot: ResourceManagerSnapshot,
  itemSnapshot: ResourceItemSnapshot,
  updates: Partial<
    Pick<ResourceManagerSnapshot, 'succeeded' | 'failed' | 'skipped'>
  >,
): ResourceManagerSnapshot {
  return {
    ...snapshot,
    ...updates,
    completed: snapshot.completed + 1,
    progress:
      snapshot.total === 0 ? 0 : (snapshot.completed + 1) / snapshot.total,
    activeItems: snapshot.activeItems.filter(
      (active) => active.id !== itemSnapshot.id,
    ),
    recentlyCompleted: [...snapshot.recentlyCompleted, itemSnapshot],
  }
}

export class ResourceManager {
  readonly options: ResourceManagerOptions
  private readonly loaders: ResourceLoaderRegistry
  private snapshot: ResourceManagerSnapshot
  private activeSession: Promise<CompletedPreloadResult> | null
  private activeSessionSignature: string | null

  constructor(options: ResourceManagerOptions = {}) {
    this.options = options
    this.snapshot = createIdleSnapshot()
    this.loaders = {
      ...createDefaultLoaders(),
      ...options.loaders,
    }
    this.activeSession = null
    this.activeSessionSignature = null
  }

  getSnapshot(): ResourceManagerSnapshot {
    return cloneSnapshot(this.snapshot)
  }

  preload(resources: ResourceBuckets = {}): Promise<CompletedPreloadResult> {
    const items = normalizeResourceBuckets(resources)
    const signature = createNormalizedResourceSignature(items)

    if (this.snapshot.status === 'running' && this.activeSession) {
      if (this.activeSessionSignature === signature) {
        return this.activeSession
      }

      return Promise.reject(
        new Error(
          'ResourceManager.preload() called with different resources while a session is already running',
        ),
      )
    }

    const session = this.runSession(items)
    this.activeSession = session
    this.activeSessionSignature = signature
    return session
  }

  private async runSession(
    items: NormalizedResourceItem[],
  ): Promise<CompletedPreloadResult> {
    const startedAt = Date.now()

    this.snapshot = createRunningSnapshot(items.length, startedAt)

    try {
      for (const item of items) {
        await this.runItem(item)
      }

      const endedAt = Date.now()
      const completedSnapshot: ResourceManagerSnapshot & { status: 'completed' } = {
        ...this.snapshot,
        status: 'completed',
        endedAt,
        queued: 0,
        loading: 0,
        progress: this.snapshot.total === 0 ? 0 : 1,
      }
      this.snapshot = completedSnapshot

      return createPreloadResult(completedSnapshot, startedAt, endedAt)
    } catch (error) {
      const endedAt = Date.now()
      const failedSnapshot: ResourceManagerSnapshot & { status: 'failed' } = {
        ...this.snapshot,
        status: 'failed',
        endedAt,
        queued: 0,
        loading: 0,
      }
      this.snapshot = failedSnapshot

      const failedResult: FailedPreloadResult = {
        status: 'failed',
        total: failedSnapshot.total,
        succeeded: failedSnapshot.succeeded,
        failed: failedSnapshot.failed,
        skipped: failedSnapshot.skipped,
        duration: endedAt - startedAt,
        items: failedSnapshot.recentlyCompleted.map(cloneItemSnapshot),
        errors: failedSnapshot.errors.map((failure) => ({ ...failure })),
        warnings: failedSnapshot.warnings.map((warning) => ({ ...warning })),
      }

      throw new ResourcePreloadError('Resource preload failed', failedResult)
    } finally {
      this.activeSession = null
      this.activeSessionSignature = null
    }
  }

  private async runItem(item: NormalizedResourceItem): Promise<void> {
    const startedAt = Date.now()
    let attempt = 0

    this.snapshot = {
      ...this.snapshot,
      queued: Math.max(0, this.snapshot.queued - 1),
      loading: this.snapshot.loading + 1,
      activeItems: [
        ...this.snapshot.activeItems,
        createItemSnapshot(item, 'loading', startedAt, null, 1),
      ],
    }

    const loader = this.loaders[item.loaderKey]
    while (true) {
      attempt += 1
      this.snapshot = updateActiveItemSnapshot(
        this.snapshot,
        createItemSnapshot(item, 'loading', startedAt, null, attempt),
      )

      try {
        await loader(item, {
          signal: new AbortController().signal,
        })

        const endedAt = Date.now()
        const succeededSnapshot = createItemSnapshot(
          item,
          'succeeded',
          startedAt,
          endedAt,
          attempt,
        )

        this.snapshot = {
          ...appendCompletedItem(this.snapshot, succeededSnapshot, {
            succeeded: this.snapshot.succeeded + 1,
          }),
          loading: Math.max(0, this.snapshot.loading - 1),
        }
        return
      } catch (error) {
        const failure = createResourceFailure(item, error, attempt)

        if (shouldRetryFailure(failure, attempt, this.options.retry)) {
          const delayMs = getRetryDelayMs(attempt, this.options.retry)
          await waitForRetryDelay(delayMs)
          continue
        }

        const endedAt = Date.now()

        if (item.optional) {
          const warning = createResourceSkippedWarning(failure)
          const skippedItem = {
            ...createItemSnapshot(item, 'skipped', startedAt, endedAt, attempt),
            message: warning.message,
          }

          this.snapshot = {
            ...appendCompletedItem(this.snapshot, skippedItem, {
              skipped: this.snapshot.skipped + 1,
            }),
            loading: Math.max(0, this.snapshot.loading - 1),
            warnings: [...this.snapshot.warnings, warning],
          }
          return
        }

        const failedItem = {
          ...createItemSnapshot(item, 'failed', startedAt, endedAt, attempt),
          message: failure.message,
          error: failure,
        }

        this.snapshot = {
          ...appendCompletedItem(this.snapshot, failedItem, {
            failed: this.snapshot.failed + 1,
          }),
          loading: Math.max(0, this.snapshot.loading - 1),
          errors: [...this.snapshot.errors, failure],
        }

        throw error
      }
    }
  }
}
