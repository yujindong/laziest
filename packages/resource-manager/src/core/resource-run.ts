import type {
  ResourceCompleteResult,
  ResourcePlan,
  ResourceReadyResult,
  ResourceRunActiveItemSnapshot,
  ResourceRunGroupSnapshot,
  ResourceRunSnapshot,
  ResourceRuntimeOptions,
} from '../shared/types'

type WaiterState<T> =
  | { status: 'pending' }
  | { status: 'resolved'; value: T }
  | { status: 'rejected'; reason: unknown }

interface Waiter<T> {
  state: WaiterState<T>
  promise?: Promise<T>
  resolve?: (value: T) => void
  reject?: (reason?: unknown) => void
}

interface InternalRunState {
  snapshot: ResourceRunSnapshot
  readyWaiter: Waiter<ResourceReadyResult>
  completeWaiter: Waiter<ResourceCompleteResult>
}

export interface ResourceRunController {
  readonly run: ResourceRun
  getSnapshot(): ResourceRunSnapshot
  setSnapshot(snapshot: ResourceRunSnapshot): void
  resolveReady(result: ResourceReadyResult): void
  rejectReady(error: unknown): void
  resolveComplete(result: ResourceCompleteResult): void
  rejectComplete(error: unknown): void
  isReadySettled(): boolean
  isCompleteSettled(): boolean
}

const internalRunState = new WeakMap<ResourceRun, InternalRunState>()

function createPendingWaiter<T>(): Waiter<T> {
  return { state: { status: 'pending' } }
}

function createWaiterPromise<T>(waiter: Waiter<T>): Promise<T> {
  if (waiter.state.status === 'resolved') {
    return Promise.resolve(waiter.state.value)
  }

  if (waiter.state.status === 'rejected') {
    return Promise.reject(waiter.state.reason)
  }

  if (waiter.promise) {
    return waiter.promise
  }

  waiter.promise = new Promise<T>((resolve, reject) => {
    waiter.resolve = resolve
    waiter.reject = reject
  })

  return waiter.promise
}

function settleWaiterResolved<T>(waiter: Waiter<T>, value: T): void {
  if (waiter.state.status !== 'pending') {
    return
  }

  waiter.state = { status: 'resolved', value }
  waiter.resolve?.(value)
  waiter.resolve = undefined
  waiter.reject = undefined
}

function settleWaiterRejected<T>(waiter: Waiter<T>, reason: unknown): void {
  if (waiter.state.status !== 'pending') {
    return
  }

  waiter.state = { status: 'rejected', reason }
  waiter.reject?.(reason)
  waiter.resolve = undefined
  waiter.reject = undefined
}

function cloneActiveItem(
  item: ResourceRunActiveItemSnapshot,
): ResourceRunActiveItemSnapshot {
  return { ...item }
}

function cloneGroup(group: ResourceRunGroupSnapshot): ResourceRunGroupSnapshot {
  return { ...group }
}

function getInternalState(run: ResourceRun): InternalRunState {
  const state = internalRunState.get(run)

  if (!state) {
    throw new Error('ResourceRun internal state missing')
  }

  return state
}

export function createReadyResult(
  snapshot: ResourceRunSnapshot,
): ResourceReadyResult {
  return {
    status: snapshot.status === 'failed' ? 'failed' : 'ready',
    startedAt: snapshot.startedAt,
    readyAt: snapshot.readyAt ?? snapshot.endedAt,
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
    readyAt: null,
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

  getSnapshot(): ResourceRunSnapshot {
    return cloneRunSnapshot(getInternalState(this).snapshot)
  }

  waitForReady(): Promise<ResourceReadyResult> {
    return createWaiterPromise(getInternalState(this).readyWaiter)
  }

  waitForAll(): Promise<ResourceCompleteResult> {
    return createWaiterPromise(getInternalState(this).completeWaiter)
  }
}

export function createResourceRunController(
  plan: ResourcePlan,
  options: ResourceRuntimeOptions = {},
): ResourceRunController {
  const run = new ResourceRun(plan, options)

  internalRunState.set(run, {
    snapshot: createIdleRunSnapshot(),
    readyWaiter: createPendingWaiter<ResourceReadyResult>(),
    completeWaiter: createPendingWaiter<ResourceCompleteResult>(),
  })

  return {
    run,
    getSnapshot: () => cloneRunSnapshot(getInternalState(run).snapshot),
    setSnapshot: (snapshot) => {
      getInternalState(run).snapshot = snapshot
    },
    resolveReady: (result) => {
      settleWaiterResolved(getInternalState(run).readyWaiter, result)
    },
    rejectReady: (error) => {
      settleWaiterRejected(getInternalState(run).readyWaiter, error)
    },
    resolveComplete: (result) => {
      settleWaiterResolved(getInternalState(run).completeWaiter, result)
    },
    rejectComplete: (error) => {
      settleWaiterRejected(getInternalState(run).completeWaiter, error)
    },
    isReadySettled: () => getInternalState(run).readyWaiter.state.status !== 'pending',
    isCompleteSettled: () =>
      getInternalState(run).completeWaiter.state.status !== 'pending',
  }
}
