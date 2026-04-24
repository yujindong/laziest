import type {
  ResourceCompleteResult,
  ResourcePlan,
  ResourceReadyResult,
  ResourceRunActiveItemSnapshot,
  ResourceRunGroupSnapshot,
  ResourceRunSnapshot,
  ResourceRuntimeOptions,
} from '../shared/types'

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
  reject(reason?: unknown): void
  isSettled(): boolean
}

function createDeferred<T>(): Deferred<T> {
  let resolvePromise!: (value: T) => void
  let rejectPromise!: (reason?: unknown) => void
  let settled = false

  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = (value) => {
      if (settled) {
        return
      }

      settled = true
      resolve(value)
    }
    rejectPromise = (reason) => {
      if (settled) {
        return
      }

      settled = true
      reject(reason)
    }
  })

  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
    isSettled: () => settled,
  }
}

function cloneActiveItem(
  item: ResourceRunActiveItemSnapshot,
): ResourceRunActiveItemSnapshot {
  return { ...item }
}

function cloneGroup(group: ResourceRunGroupSnapshot): ResourceRunGroupSnapshot {
  return { ...group }
}

export function createReadyResult(
  snapshot: ResourceRunSnapshot,
): ResourceReadyResult {
  return {
    status: snapshot.status === 'failed' ? 'failed' : 'ready',
    startedAt: snapshot.startedAt,
    readyAt: snapshot.endedAt,
    progress: snapshot.progress,
    groups: snapshot.groups.map(cloneGroup),
    activeItems: snapshot.activeItems.map(cloneActiveItem),
    errors: snapshot.errors.map((error) => ({ ...error })),
    warnings: snapshot.warnings.map((warning) => ({ ...warning })),
  }
}

export function createCompleteResult(
  snapshot: ResourceRunSnapshot,
): ResourceCompleteResult {
  return {
    status: snapshot.status === 'failed' ? 'failed' : 'completed',
    startedAt: snapshot.startedAt,
    endedAt: snapshot.endedAt,
    progress: snapshot.progress,
    groups: snapshot.groups.map(cloneGroup),
    activeItems: snapshot.activeItems.map(cloneActiveItem),
    errors: snapshot.errors.map((error) => ({ ...error })),
    warnings: snapshot.warnings.map((warning) => ({ ...warning })),
  }
}

export function createIdleRunSnapshot(): ResourceRunSnapshot {
  return {
    status: 'idle',
    startedAt: null,
    endedAt: null,
    progress: 0,
    groups: [],
    activeItems: [],
    errors: [],
    warnings: [],
  }
}

export function cloneRunSnapshot(
  snapshot: ResourceRunSnapshot,
): ResourceRunSnapshot {
  return {
    ...snapshot,
    groups: snapshot.groups.map(cloneGroup),
    activeItems: snapshot.activeItems.map(cloneActiveItem),
    errors: snapshot.errors.map((error) => ({ ...error })),
    warnings: snapshot.warnings.map((warning) => ({ ...warning })),
  }
}

export class ResourceRun {
  constructor(
    readonly plan: ResourcePlan,
    readonly options: ResourceRuntimeOptions = {},
  ) {}

  private snapshot = createIdleRunSnapshot()
  private readonly readyDeferred = createDeferred<ResourceReadyResult>()
  private readonly completeDeferred = createDeferred<ResourceCompleteResult>()

  getSnapshot(): ResourceRunSnapshot {
    return cloneRunSnapshot(this.snapshot)
  }

  waitForReady(): Promise<ResourceReadyResult> {
    return this.readyDeferred.promise
  }

  waitForAll(): Promise<ResourceCompleteResult> {
    return this.completeDeferred.promise
  }

  setSnapshot(snapshot: ResourceRunSnapshot): void {
    this.snapshot = snapshot
  }

  resolveReady(result: ResourceReadyResult): void {
    this.readyDeferred.resolve(result)
  }

  rejectReady(error: unknown): void {
    this.readyDeferred.reject(error)
  }

  resolveComplete(result: ResourceCompleteResult): void {
    this.completeDeferred.resolve(result)
  }

  rejectComplete(error: unknown): void {
    this.completeDeferred.reject(error)
  }

  isReadySettled(): boolean {
    return this.readyDeferred.isSettled()
  }

  isCompleteSettled(): boolean {
    return this.completeDeferred.isSettled()
  }
}
