import type {
  AbortedPreloadResult,
  CompletedPreloadResult,
  ResourceBuckets,
  ResourceLoaderRegistry,
  ResourceManagerEvent,
  ResourceManagerOptions,
  ResourceManagerSnapshot,
  ResourceManagerSubscriber,
  ResourceItemSnapshot,
  PreloadResult,
} from '../shared/types'
import {
  createNormalizedResourceSignature,
  normalizeResourceBuckets,
} from './normalize'
import { consoleResourceLogger, createFilteredResourceLogger } from '../shared/logger'
import { createLoaderRegistry } from '../loaders'
import { PreloadSession } from './session'

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

function cloneItemSnapshot(item: ResourceItemSnapshot): ResourceItemSnapshot {
  return {
    ...item,
    transfer: item.transfer ? { ...item.transfer } : undefined,
    error: item.error ? { ...item.error } : undefined,
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

function clonePreloadResult(result: PreloadResult): PreloadResult {
  return {
    ...result,
    items: result.items.map(cloneItemSnapshot),
    errors: result.errors.map((error) => ({ ...error })),
    warnings: result.warnings.map((warning) => ({ ...warning })),
  }
}

function cloneResourceManagerEvent(event: ResourceManagerEvent): ResourceManagerEvent {
  switch (event.type) {
    case 'session-started':
      return { ...event }
    case 'item-started':
    case 'item-progress':
    case 'item-succeeded':
    case 'item-retrying':
    case 'item-failed':
      return {
        ...event,
        item: cloneItemSnapshot(event.item),
        ...(event.type === 'item-retrying' || event.type === 'item-failed'
          ? { failure: { ...event.failure } }
          : {}),
      } as ResourceManagerEvent
    case 'warning':
      return { ...event, warning: { ...event.warning } }
    case 'session-completed':
    case 'session-failed':
    case 'session-aborted':
      return {
        ...event,
        result: clonePreloadResult(event.result),
      } as ResourceManagerEvent
    case 'session-reset':
      return { ...event }
  }
}

export class ResourceManager {
  readonly options: ResourceManagerOptions
  private readonly loaders: ResourceLoaderRegistry
  private readonly logger: ReturnType<typeof createFilteredResourceLogger>
  private readonly subscribers = new Set<ResourceManagerSubscriber>()
  private readonly successfulResources = new Set<string>()
  private snapshot: ResourceManagerSnapshot
  private activeSession: PreloadSession | null
  private activeSessionSignature: string | null
  private nextSessionId: number

  constructor(options: ResourceManagerOptions = {}) {
    this.options = options
    this.snapshot = createIdleSnapshot()
    this.loaders = {
      ...createLoaderRegistry(),
      ...options.loaders,
    }
    this.logger = createFilteredResourceLogger(
      options.logger ?? consoleResourceLogger,
      options.logLevel ?? 'silent',
    )
    this.activeSession = null
    this.activeSessionSignature = null
    this.nextSessionId = 0
  }

  getSnapshot(): ResourceManagerSnapshot {
    return cloneSnapshot(this.snapshot)
  }

  subscribe(listener: ResourceManagerSubscriber): () => void {
    this.subscribers.add(listener)
    return () => {
      this.subscribers.delete(listener)
    }
  }

  abort(): void {
    if (!this.activeSession) {
      return
    }

    const session = this.activeSession
    const endedAt = Date.now()
    const abortedSnapshot: ResourceManagerSnapshot & { status: 'aborted' } = {
      ...this.snapshot,
      status: 'aborted',
      endedAt,
      queued: 0,
      loading: 0,
      activeItems: [],
    }
    const result: AbortedPreloadResult = {
      status: 'aborted' as const,
      total: abortedSnapshot.total,
      succeeded: abortedSnapshot.succeeded,
      failed: abortedSnapshot.failed,
      skipped: abortedSnapshot.skipped,
      duration: endedAt - session.startedAt,
      items: abortedSnapshot.recentlyCompleted.map(cloneItemSnapshot),
      errors: abortedSnapshot.errors.map((error) => ({ ...error })),
      warnings: abortedSnapshot.warnings.map((warning) => ({ ...warning })),
    }

    this.snapshot = abortedSnapshot
    this.logger.warn('Resource preload aborted', { result })
    this.emit({
      type: 'session-aborted',
      result,
    })

    session.abort(result)
    this.clearActiveSession(session.id)
  }

  reset(): void {
    if (this.activeSession) {
      this.abort()
    }

    if (this.options.resetClearsCache) {
      this.successfulResources.clear()
    }

    this.snapshot = createIdleSnapshot()
    this.emit({ type: 'session-reset' })
  }

  preload(resources: ResourceBuckets = {}): Promise<CompletedPreloadResult> {
    const items = normalizeResourceBuckets(resources)
    const signature = createNormalizedResourceSignature(items)

    if (this.activeSession) {
      if (this.activeSessionSignature === signature) {
        this.logger.info('Resource preload reused active session', {
          total: items.length,
          signature,
        })
        return this.activeSession.promise
      }

      return Promise.reject(
        new Error(
          'ResourceManager.preload() called with different resources while a session is already running',
        ),
      )
    }

    const session = new PreloadSession(
      {
        loaders: this.loaders,
        options: this.options,
        logger: this.logger,
        setSnapshot: (snapshot) => {
          this.snapshot = snapshot
        },
        emit: (event) => this.emit(event),
        hasSuccessfulResource: (dedupeKey) =>
          this.successfulResources.has(dedupeKey),
        rememberSuccessfulResource: (item) => {
          this.successfulResources.add(item.dedupeKey)
        },
      },
      ++this.nextSessionId,
      signature,
      items,
    )

    this.activeSession = session
    this.activeSessionSignature = signature
    void session.promise.then(
      () => {
        this.clearActiveSession(session.id)
      },
      () => {
        this.clearActiveSession(session.id)
      },
    )

    return session.promise
  }

  private emit(event: ResourceManagerEvent): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber({
          snapshot: cloneSnapshot(this.snapshot),
          event: cloneResourceManagerEvent(event),
        })
      } catch (error) {
        this.logger.error('ResourceManager subscriber threw', {
          error,
          event: event.type,
        })
      }
    }
  }

  private clearActiveSession(sessionId: number): void {
    if (this.activeSession?.id !== sessionId) {
      return
    }

    this.activeSession = null
    this.activeSessionSignature = null
  }
}
