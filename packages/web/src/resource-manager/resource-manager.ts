import type {
  AbortedPreloadResult,
  CompletedPreloadResult,
  FailedPreloadResult,
  NormalizedResourceItem,
  ResourceBuckets,
  ResourceLoaderRegistry,
  ResourceManagerEvent,
  ResourceManagerEventPayload,
  ResourceManagerOptions,
  ResourceManagerSnapshot,
  ResourceManagerSubscriber,
  ResourceItemSnapshot,
  PreloadResult,
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
import {
  consoleResourceLogger,
  createFilteredResourceLogger,
} from './logger'

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

function createCompletedPreloadResult(
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

function createFailedPreloadResult(
  snapshot: ResourceManagerSnapshot & { status: 'failed' },
  startedAt: number,
  endedAt: number,
): FailedPreloadResult {
  return {
    status: 'failed',
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

function createAbortedPreloadResult(
  snapshot: ResourceManagerSnapshot & { status: 'aborted' },
  startedAt: number,
  endedAt: number,
): AbortedPreloadResult {
  return {
    status: 'aborted',
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

function clonePreloadResult(result: PreloadResult): PreloadResult {
  switch (result.status) {
    case 'completed':
      return {
        ...result,
        items: result.items.map(cloneItemSnapshot),
        errors: result.errors.map((error) => ({ ...error })),
        warnings: result.warnings.map((warning) => ({ ...warning })),
      }
    case 'failed':
      return {
        ...result,
        items: result.items.map(cloneItemSnapshot),
        errors: result.errors.map((error) => ({ ...error })),
        warnings: result.warnings.map((warning) => ({ ...warning })),
      }
    case 'aborted':
      return {
        ...result,
        items: result.items.map(cloneItemSnapshot),
        errors: result.errors.map((error) => ({ ...error })),
        warnings: result.warnings.map((warning) => ({ ...warning })),
      }
  }
}

function cloneResourceManagerEvent(event: ResourceManagerEvent): ResourceManagerEvent {
  switch (event.type) {
    case 'session-started':
      return { ...event }
    case 'item-started':
      return {
        ...event,
        item: cloneItemSnapshot(event.item),
      } as ResourceManagerEvent
    case 'item-succeeded':
      return {
        ...event,
        item: cloneItemSnapshot(event.item),
      } as ResourceManagerEvent
    case 'item-retrying':
      return {
        ...event,
        item: cloneItemSnapshot(event.item),
        failure: { ...event.failure },
      } as ResourceManagerEvent
    case 'item-failed':
      return {
        ...event,
        item: cloneItemSnapshot(event.item),
        failure: { ...event.failure },
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

function createAbortError(message = 'Aborted'): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

async function raceWithAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    throw signal.reason ?? createAbortError()
  }

  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup()
      reject(signal.reason ?? createAbortError())
    }

    const cleanup = () => {
      signal.removeEventListener('abort', onAbort)
    }

    signal.addEventListener('abort', onAbort, { once: true })

    promise.then(
      (value) => {
        cleanup()
        resolve(value)
      },
      (error) => {
        cleanup()
        reject(error)
      },
    )
  })
}

function waitForRetryDelayOrAbort(
  ms: number,
  signal: AbortSignal,
): Promise<void> {
  if (ms <= 0) {
    return raceWithAbort(Promise.resolve(), signal)
  }

  return raceWithAbort(waitForRetryDelay(ms), signal)
}

interface SessionState {
  id: number
  controller: AbortController
  startedAt: number
  abortedResult: AbortedPreloadResult | null
}

export class ResourceManager {
  readonly options: ResourceManagerOptions
  private readonly loaders: ResourceLoaderRegistry
  private readonly logger: ReturnType<typeof createFilteredResourceLogger>
  private readonly subscribers = new Set<ResourceManagerSubscriber>()
  private snapshot: ResourceManagerSnapshot
  private activeSession: Promise<CompletedPreloadResult> | null
  private activeSessionSignature: string | null
  private activeSessionState: SessionState | null
  private nextSessionId: number

  constructor(options: ResourceManagerOptions = {}) {
    this.options = options
    this.snapshot = createIdleSnapshot()
    this.loaders = {
      ...createDefaultLoaders(),
      ...options.loaders,
    }
    this.logger = createFilteredResourceLogger(
      options.logger ?? consoleResourceLogger,
      options.logLevel ?? 'silent',
    )
    this.activeSession = null
    this.activeSessionSignature = null
    this.activeSessionState = null
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
    if (this.snapshot.status !== 'running' || !this.activeSessionState) {
      return
    }

    const session = this.activeSessionState
    const endedAt = Date.now()
    const abortedSnapshot: ResourceManagerSnapshot & { status: 'aborted' } = {
      ...this.snapshot,
      status: 'aborted',
      endedAt,
      queued: 0,
      loading: 0,
      activeItems: [],
    }
    const result = createAbortedPreloadResult(
      abortedSnapshot,
      session.startedAt,
      endedAt,
    )

    session.abortedResult = result
    this.snapshot = abortedSnapshot
    this.logger.warn('Resource preload aborted', { result })
    this.emit({
      type: 'session-aborted',
      result,
    })

    this.activeSession = null
    this.activeSessionSignature = null
    this.activeSessionState = null

    session.controller.abort(createAbortError())
  }

  reset(): void {
    if (this.snapshot.status === 'running' && this.activeSessionState) {
      this.abort()
    }

    this.snapshot = createIdleSnapshot()
    this.emit({ type: 'session-reset' })
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

    const sessionId = ++this.nextSessionId
    const controller = new AbortController()
    const sessionState: SessionState = {
      id: sessionId,
      controller,
      startedAt: Date.now(),
      abortedResult: null,
    }
    const session = this.runSession(items, sessionState)

    this.activeSession = session
    this.activeSessionSignature = signature
    this.activeSessionState = sessionState

    return session
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

  private isCurrentSession(sessionId: number): boolean {
    return this.activeSessionState?.id === sessionId
  }

  private clearSessionIfCurrent(sessionId: number): void {
    if (!this.isCurrentSession(sessionId)) {
      return
    }

    this.activeSession = null
    this.activeSessionSignature = null
    this.activeSessionState = null
  }

  private async runSession(
    items: NormalizedResourceItem[],
    session: SessionState,
  ): Promise<CompletedPreloadResult> {
    const startedAt = session.startedAt

    this.snapshot = createRunningSnapshot(items.length, startedAt)
    this.logger.info('Resource preload started', {
      total: items.length,
      startedAt,
    })
    this.emit({
      type: 'session-started',
      startedAt,
      total: items.length,
    })

    try {
      for (const item of items) {
        await this.runItem(item, session.controller)
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
      const result = createCompletedPreloadResult(
        completedSnapshot,
        startedAt,
        endedAt,
      )

      if (this.isCurrentSession(session.id)) {
        this.snapshot = completedSnapshot
        this.logger.info('Resource preload completed', { result })
        this.emit({
          type: 'session-completed',
          result,
        })
      }

      return result
    } catch (error) {
      const endedAt = Date.now()
      const aborted = session.controller.signal.aborted || isAbortError(error)

      if (aborted) {
        const result =
          session.abortedResult ??
          createAbortedPreloadResult(
            {
              ...this.snapshot,
              status: 'aborted',
              endedAt,
              queued: 0,
              loading: 0,
              activeItems: [],
            },
            startedAt,
            endedAt,
          )

        if (this.isCurrentSession(session.id)) {
          this.snapshot = {
            ...this.snapshot,
            status: 'aborted',
            endedAt,
            queued: 0,
            loading: 0,
            activeItems: [],
          }
          this.logger.warn('Resource preload aborted', { result })
          this.emit({
            type: 'session-aborted',
            result,
          })
        }

        throw new ResourcePreloadError('Resource preload aborted', result)
      }

      const failedSnapshot: ResourceManagerSnapshot & { status: 'failed' } = {
        ...this.snapshot,
        status: 'failed',
        endedAt,
        queued: 0,
        loading: 0,
      }
      const result = createFailedPreloadResult(
        failedSnapshot,
        startedAt,
        endedAt,
      )

      if (this.isCurrentSession(session.id)) {
        this.snapshot = failedSnapshot
        this.logger.error('Resource preload failed', { result })
        this.emit({
          type: 'session-failed',
          result,
        })
      }

      throw new ResourcePreloadError('Resource preload failed', result)
    } finally {
      this.clearSessionIfCurrent(session.id)
    }
  }

  private async runItem(
    item: NormalizedResourceItem,
    controller: AbortController,
  ): Promise<void> {
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
    this.emit({
      type: 'item-started',
      item: cloneItemSnapshot(createItemSnapshot(item, 'loading', startedAt, null, 1)),
    })

    const loader = this.loaders[item.loaderKey]

    while (true) {
      attempt += 1
      const loadingSnapshot = createItemSnapshot(
        item,
        'loading',
        startedAt,
        null,
        attempt,
      )

      this.snapshot = updateActiveItemSnapshot(this.snapshot, loadingSnapshot)

      try {
        await raceWithAbort(
          Promise.resolve(
            loader(item, {
              signal: controller.signal,
            }),
          ),
          controller.signal,
        )

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
        this.emit({
          type: 'item-succeeded',
          item: cloneItemSnapshot(succeededSnapshot),
        })
        return
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          throw error
        }

        const failure = createResourceFailure(item, error, attempt)

        if (shouldRetryFailure(failure, attempt, this.options.retry)) {
          const retryAfterMs = getRetryDelayMs(attempt, this.options.retry)
          this.logger.debug('Resource item retrying', {
            item: item.url,
            attempt,
            retryAfterMs,
            failure,
          })
          this.emit({
            type: 'item-retrying',
            item: cloneItemSnapshot(loadingSnapshot),
            failure,
            retryAfterMs,
          })
          await waitForRetryDelayOrAbort(retryAfterMs, controller.signal)
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
          this.logger.warn('Resource item skipped', { warning })
          this.emit({
            type: 'warning',
            warning: { ...warning },
          })
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
        this.emit({
          type: 'item-failed',
          item: cloneItemSnapshot(failedItem),
          failure: { ...failure },
        })

        throw error
      }
    }
  }
}
