import { createResourceFailure, createResourceSkippedWarning, ResourcePreloadError } from './errors'
import { getRetryDelayMs, shouldRetryFailure, waitForRetryDelay } from './retry'
import { runWithConcurrency } from './queue'
import type {
  AbortedPreloadResult,
  CompletedPreloadResult,
  NormalizedResourceItem,
  ResourceItemSnapshot,
  ResourceLoaderRegistry,
  ResourceManagerEvent,
  ResourceManagerOptions,
  ResourceManagerSnapshot,
  FailedPreloadResult,
} from './types'

interface ResourceSessionHost {
  readonly loaders: ResourceLoaderRegistry
  readonly options: ResourceManagerOptions
  readonly logger: {
    error(message: string, context?: unknown): void
    warn(message: string, context?: unknown): void
    info(message: string, context?: unknown): void
    debug(message: string, context?: unknown): void
  }
  setSnapshot(snapshot: ResourceManagerSnapshot): void
  emit(event: ResourceManagerEvent): void
  hasSuccessfulResource(dedupeKey: string): boolean
  rememberSuccessfulResource(item: NormalizedResourceItem): void
}

interface WorkGroup {
  readonly key: string
  readonly items: NormalizedResourceItem[]
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
  fromCache = false,
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
    fromCache,
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

function createWorkGroups(items: NormalizedResourceItem[]): WorkGroup[] {
  const groups = new Map<string, WorkGroup>()
  const orderedGroups: WorkGroup[] = []

  for (const item of items) {
    const existing = groups.get(item.dedupeKey)

    if (existing) {
      existing.items.push(item)
      continue
    }

    const group = { key: item.dedupeKey, items: [item] }
    groups.set(item.dedupeKey, group)
    orderedGroups.push(group)
  }

  return orderedGroups
}

export interface PreloadSessionHandle {
  readonly id: number
  readonly signature: string
  readonly startedAt: number
  readonly controller: AbortController
  readonly promise: Promise<CompletedPreloadResult>
  abortedResult: AbortedPreloadResult | null
  abort(result: AbortedPreloadResult): void
}

export class PreloadSession implements PreloadSessionHandle {
  readonly controller = new AbortController()
  readonly startedAt: number
  readonly promise: Promise<CompletedPreloadResult>
  abortedResult: AbortedPreloadResult | null = null

  private snapshot: ResourceManagerSnapshot
  private terminalStatus: 'running' | 'completed' | 'failed' | 'aborted' = 'running'

  constructor(
    private readonly host: ResourceSessionHost,
    readonly id: number,
    readonly signature: string,
    private readonly items: NormalizedResourceItem[],
  ) {
    this.startedAt = Date.now()
    this.snapshot = createRunningSnapshot(items.length, this.startedAt)
    this.host.setSnapshot(this.snapshot)
    this.host.logger.info('Resource preload started', {
      total: items.length,
      startedAt: this.startedAt,
    })
    this.host.emit({
      type: 'session-started',
      startedAt: this.startedAt,
      total: items.length,
    })
    this.promise = this.run()
  }

  abort(result: AbortedPreloadResult): void {
    if (this.terminalStatus !== 'running') {
      return
    }

    this.abortedResult = result
    this.terminalStatus = 'aborted'
    this.controller.abort(createAbortError())
  }

  private isRunning(): boolean {
    return this.terminalStatus === 'running'
  }

  private setSnapshot(snapshot: ResourceManagerSnapshot): void {
    this.snapshot = snapshot
    this.host.setSnapshot(snapshot)
  }

  private emit(event: ResourceManagerEvent): void {
    this.host.emit(event)
  }

  private async run(): Promise<CompletedPreloadResult> {
    const groups = createWorkGroups(this.items)

    try {
      await runWithConcurrency(
        groups,
        this.host.options.concurrency ?? 1,
        async (group) => {
          await this.processGroup(group)
        },
      )

      const endedAt = Date.now()
      const completedSnapshot: ResourceManagerSnapshot & { status: 'completed' } =
        {
          ...this.snapshot,
          status: 'completed',
          endedAt,
          queued: 0,
          loading: 0,
          progress: this.snapshot.total === 0 ? 0 : 1,
        }
      const result = createCompletedPreloadResult(
        completedSnapshot,
        this.startedAt,
        endedAt,
      )

      if (this.isRunning()) {
        this.terminalStatus = 'completed'
        this.setSnapshot(completedSnapshot)
        this.host.logger.info('Resource preload completed', { result })
        this.emit({
          type: 'session-completed',
          result,
        })
      }

      return result
    } catch (error) {
      const endedAt = Date.now()

      if (this.terminalStatus === 'failed') {
        const failedSnapshot: ResourceManagerSnapshot & { status: 'failed' } = {
          ...this.snapshot,
          status: 'failed',
          endedAt,
          queued: 0,
          loading: 0,
        }
        const result = createFailedPreloadResult(
          failedSnapshot,
          this.startedAt,
          endedAt,
        )

        this.setSnapshot(failedSnapshot)
        this.host.logger.error('Resource preload failed', { result })
        this.emit({
          type: 'session-failed',
          result,
        })

        throw new ResourcePreloadError('Resource preload failed', result)
      }

      if (this.terminalStatus === 'aborted' || this.abortedResult || this.controller.signal.aborted || isAbortError(error)) {
        const result =
          this.abortedResult ??
          createAbortedPreloadResult(
            {
              ...this.snapshot,
              status: 'aborted',
              endedAt,
              queued: 0,
              loading: 0,
              activeItems: [],
            },
            this.startedAt,
            endedAt,
          )

        if (!this.abortedResult) {
          this.terminalStatus = 'aborted'
          this.setSnapshot({
            ...this.snapshot,
            status: 'aborted',
            endedAt,
            queued: 0,
            loading: 0,
            activeItems: [],
          })
          this.host.logger.warn('Resource preload aborted', { result })
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
        this.startedAt,
        endedAt,
      )

      this.setSnapshot(failedSnapshot)
      this.host.logger.error('Resource preload failed', { result })
      this.emit({
        type: 'session-failed',
        result,
      })

      throw new ResourcePreloadError('Resource preload failed', result)
    }
  }

  private async processGroup(group: WorkGroup): Promise<void> {
    if (!this.isRunning()) {
      return
    }

    const startedAt = Date.now()
    const loadingSnapshots = group.items.map((item) =>
      createItemSnapshot(item, 'loading', startedAt, null, 1),
    )

    this.setSnapshot({
      ...this.snapshot,
      queued: Math.max(0, this.snapshot.queued - group.items.length),
      loading: this.snapshot.loading + group.items.length,
      activeItems: [...this.snapshot.activeItems, ...loadingSnapshots],
    })

    for (const loadingSnapshot of loadingSnapshots) {
      this.emit({
        type: 'item-started',
        item: cloneItemSnapshot(loadingSnapshot),
      })
    }

    if (!this.isRunning()) {
      return
    }

    if (this.host.hasSuccessfulResource(group.key)) {
      await this.completeGroup(group, startedAt, startedAt, 1, true)
      return
    }

    const loader = this.host.loaders[group.items[0].loaderKey]
    let attempt = 0

    while (true) {
      attempt += 1

      try {
        await raceWithAbort(
          Promise.resolve(
            loader(group.items[0], {
              signal: this.controller.signal,
            }),
          ),
          this.controller.signal,
        )

        await this.completeGroup(group, startedAt, Date.now(), attempt, false)
        return
      } catch (error) {
        if (this.controller.signal.aborted || isAbortError(error)) {
          throw error
        }

        const failure = createResourceFailure(group.items[0], error, attempt)

        if (shouldRetryFailure(failure, attempt, this.host.options.retry)) {
          const retryAfterMs = getRetryDelayMs(attempt, this.host.options.retry)
          this.host.logger.debug('Resource item retrying', {
            item: group.items[0].url,
            attempt,
            retryAfterMs,
            failure,
          })
          this.emit({
            type: 'item-retrying',
            item: cloneItemSnapshot(
              createItemSnapshot(group.items[0], 'loading', startedAt, null, attempt),
            ),
            failure,
            retryAfterMs,
          })
          await waitForRetryDelayOrAbort(retryAfterMs, this.controller.signal)
          continue
        }

        const endedAt = Date.now()

        if (group.items.every((item) => item.optional)) {
          await this.skipGroup(group, failure, startedAt, endedAt, attempt)
          return
        }

        await this.failGroup(group, failure, startedAt, endedAt, attempt)
        this.terminalStatus = 'failed'
        this.controller.abort(createAbortError())
        throw error
      }
    }
  }

  private async completeGroup(
    group: WorkGroup,
    startedAt: number,
    endedAt: number,
    attempt: number,
    fromCache: boolean,
  ): Promise<void> {
    for (const item of group.items) {
      if (!this.isRunning()) {
        return
      }

      const succeededSnapshot = createItemSnapshot(
        item,
        'succeeded',
        startedAt,
        endedAt,
        attempt,
        fromCache,
      )

      this.setSnapshot({
        ...appendCompletedItem(this.snapshot, succeededSnapshot, {
          succeeded: this.snapshot.succeeded + 1,
        }),
        loading: Math.max(0, this.snapshot.loading - 1),
      })
      this.host.rememberSuccessfulResource(item)
      this.emit({
        type: 'item-succeeded',
        item: cloneItemSnapshot(succeededSnapshot),
      })
    }
  }

  private async skipGroup(
    group: WorkGroup,
    failure: ReturnType<typeof createResourceFailure>,
    startedAt: number,
    endedAt: number,
    attempt: number,
  ): Promise<void> {
    for (const item of group.items) {
      if (!this.isRunning()) {
        return
      }

      const warning = createResourceSkippedWarning(failure)
      const skippedItem = {
        ...createItemSnapshot(item, 'skipped', startedAt, endedAt, attempt),
        message: warning.message,
      }

      this.setSnapshot({
        ...appendCompletedItem(this.snapshot, skippedItem, {
          skipped: this.snapshot.skipped + 1,
        }),
        loading: Math.max(0, this.snapshot.loading - 1),
        warnings: [...this.snapshot.warnings, warning],
      })
      this.host.logger.warn('Resource item skipped', { warning })
      this.emit({
        type: 'warning',
        warning: { ...warning },
      })
    }
  }

  private async failGroup(
    group: WorkGroup,
    failure: ReturnType<typeof createResourceFailure>,
    startedAt: number,
    endedAt: number,
    attempt: number,
  ): Promise<void> {
    for (const item of group.items) {
      if (!this.isRunning()) {
        return
      }

      const failedItem = {
        ...createItemSnapshot(item, 'failed', startedAt, endedAt, attempt),
        message: failure.message,
        error: failure,
      }

      this.setSnapshot({
        ...appendCompletedItem(this.snapshot, failedItem, {
          failed: this.snapshot.failed + 1,
        }),
        loading: Math.max(0, this.snapshot.loading - 1),
        errors: [...this.snapshot.errors, failure],
      })
      this.emit({
        type: 'item-failed',
        item: cloneItemSnapshot(failedItem),
        failure: { ...failure },
      })
    }
  }
}
