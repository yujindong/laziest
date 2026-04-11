import type {
  NormalizedResourceItem,
  ResourceFailure,
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
import { ResourcePreloadError } from './errors'

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
): ResourceItemSnapshot {
  return {
    id: item.id,
    url: item.url,
    type: item.type,
    status,
    attempt: 1,
    startedAt,
    endedAt,
    duration:
      startedAt !== null && endedAt !== null ? endedAt - startedAt : null,
    fromCache: false,
  }
}

function createFailureSnapshot(
  item: NormalizedResourceItem,
  startedAt: number,
  endedAt: number,
  error: unknown,
): {
  item: ResourceItemSnapshot
  failure: ResourceFailure
} {
  const message = error instanceof Error ? error.message : 'Resource load failed'
  const failure: ResourceFailure = {
    category: 'unknown',
    code: 'unknown',
    retriable: false,
    message,
    cause: error,
    url: item.url,
    type: item.type,
    attempt: 1,
  }

  return {
    item: {
      ...createItemSnapshot(item, 'failed', startedAt, endedAt),
      message,
      error: failure,
    },
    failure,
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
    const loadingSnapshot = createItemSnapshot(
      item,
      'loading',
      startedAt,
      null,
    )

    this.snapshot = {
      ...this.snapshot,
      queued: Math.max(0, this.snapshot.queued - 1),
      loading: this.snapshot.loading + 1,
      activeItems: [...this.snapshot.activeItems, loadingSnapshot],
    }

    const loader = this.loaders[item.loaderKey]
    try {
      await loader(item, {
        signal: new AbortController().signal,
      })
    } catch (error) {
      const endedAt = Date.now()
      const { item: failedItem, failure } = createFailureSnapshot(
        item,
        startedAt,
        endedAt,
        error,
      )

      this.snapshot = {
        ...this.snapshot,
        loading: Math.max(0, this.snapshot.loading - 1),
        failed: this.snapshot.failed + 1,
        completed: this.snapshot.completed + 1,
        progress:
          this.snapshot.total === 0 ? 0 : (this.snapshot.completed + 1) / this.snapshot.total,
        activeItems: this.snapshot.activeItems.filter((active) => active.id !== item.id),
        recentlyCompleted: [...this.snapshot.recentlyCompleted, failedItem],
        errors: [...this.snapshot.errors, failure],
      }

      throw error
    }

    const endedAt = Date.now()
    const succeededSnapshot = createItemSnapshot(
      item,
      'succeeded',
      startedAt,
      endedAt,
    )

    this.snapshot = {
      ...this.snapshot,
      loading: Math.max(0, this.snapshot.loading - 1),
      succeeded: this.snapshot.succeeded + 1,
      completed: this.snapshot.completed + 1,
      progress:
        this.snapshot.total === 0 ? 0 : (this.snapshot.completed + 1) / this.snapshot.total,
      activeItems: this.snapshot.activeItems.filter((active) => active.id !== item.id),
      recentlyCompleted: [...this.snapshot.recentlyCompleted, succeededSnapshot],
    }
  }
}
