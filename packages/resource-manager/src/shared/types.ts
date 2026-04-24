export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug'

export type ResourceType =
  | 'image'
  | 'font'
  | 'audio'
  | 'video'
  | 'lottie'
  | 'json'
  | 'text'
  | 'binary'

export interface BaseResourceItem {
  key?: string
  url: string
  optional?: boolean
  priority?: number
}

export interface ImageResourceItem extends BaseResourceItem {
  type: 'image'
}

export interface FontResourceItem extends BaseResourceItem {
  type: 'font'
  family: string
  descriptors?: FontFaceDescriptors
}

export interface MediaResourceItem extends BaseResourceItem {
  type: 'audio' | 'video'
  preload?: 'auto' | 'metadata' | 'none'
  crossOrigin?: '' | 'anonymous' | 'use-credentials'
}

export interface DataResourceItem extends BaseResourceItem {
  type: 'json' | 'text' | 'binary' | 'lottie'
  requestInit?: RequestInit
}

export type ResourceItem =
  | ImageResourceItem
  | FontResourceItem
  | MediaResourceItem
  | DataResourceItem

export interface ResourceGroup {
  key: string
  priority?: number
  blocking?: boolean
  items: ResourceItem[]
}

export interface ResourcePlan {
  groups: ResourceGroup[]
}

export interface NormalizedGroup {
  key: string
  priority: number
  blocking: boolean
  index: number
  items: NormalizedItem[]
}

export type NormalizedItem = ResourceItem & {
  key: string
  groupKey: string
  url: string
  type: ResourceType
  optional: boolean
  priority: number
  groupPriority: number
  index: number
  groupIndex: number
  dedupeKey: string
}

export interface PrioritySchedulingUnit {
  item: NormalizedItem
  blocking: boolean
}

function cloneHeaders(headers: RequestInit['headers']): RequestInit['headers'] | undefined {
  if (!headers) {
    return undefined
  }

  if (headers instanceof Headers) {
    return Array.from(headers.entries())
  }

  if (Array.isArray(headers)) {
    return headers.map(([key, value]) => [key, value] as [string, string])
  }

  return Object.fromEntries(Object.entries(headers))
}

function cloneRequestInit(requestInit: RequestInit): RequestInit {
  return {
    ...requestInit,
    headers: cloneHeaders(requestInit.headers),
  }
}

function cloneResourceItem(item: ResourceItem): ResourceItem {
  switch (item.type) {
    case 'font':
      return {
        ...item,
        descriptors: item.descriptors ? { ...item.descriptors } : undefined,
      }
    case 'json':
    case 'text':
    case 'binary':
    case 'lottie':
      return {
        ...item,
        requestInit: item.requestInit
          ? cloneRequestInit(item.requestInit)
          : undefined,
      }
    case 'image':
    case 'audio':
    case 'video':
      return { ...item }
  }
}

export function normalizeResourcePlan(plan: ResourcePlan): ResourcePlan {
  return {
    groups: plan.groups.map((group) => ({
      key: group.key,
      priority: group.priority ?? 0,
      blocking: group.blocking ?? false,
      items: group.items.map(cloneResourceItem),
    })),
  }
}

export type ResourceBucketName =
  | 'images'
  | 'fonts'
  | 'audio'
  | 'video'
  | 'lottie'
  | 'json'
  | 'text'
  | 'binary'

export type ResourceLoaderKey =
  | 'image'
  | 'font'
  | 'audio'
  | 'video'
  | 'lottie'
  | 'json'
  | 'text'
  | 'binary'

export type ResourceManagerStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'failed'
  | 'aborted'

export type ResourceRunStatus =
  | 'idle'
  | 'running'
  | 'ready'
  | 'completed'
  | 'failed'

export type ResourceItemStatus =
  | 'queued'
  | 'loading'
  | 'succeeded'
  | 'failed'
  | 'skipped'

export type ResourceFailureCategory =
  | 'http'
  | 'network'
  | 'timeout'
  | 'abort'
  | 'decode'
  | 'parse'
  | 'unsupported'
  | 'unknown'

export interface ResourceLogger {
  error(message: string, context?: unknown): void
  warn(message: string, context?: unknown): void
  info(message: string, context?: unknown): void
  debug(message: string, context?: unknown): void
}

export interface ResourceWarning {
  code: string
  message: string
  url?: string
  type?: ResourceType
}

export interface ResourceTransfer {
  loadedBytes: number
  totalBytes?: number
}

export type RetryBackoff = 'fixed' | 'linear' | 'exponential'

export interface RetryOptions {
  maxRetries?: number
  delayMs?: number
  backoff?: RetryBackoff
  shouldRetry?: (failure: ResourceFailure, attempt: number) => boolean
}

export interface SharedResourceInput {
  url: string
  optional?: boolean
}

export type ImageResourceInput = string | SharedResourceInput

export interface FontResourceInput extends SharedResourceInput {
  family: string
  descriptors?: FontFaceDescriptors
}

export type MediaResourceInput =
  | string
  | (SharedResourceInput & {
      preload?: 'auto' | 'metadata' | 'none'
      crossOrigin?: '' | 'anonymous' | 'use-credentials'
    })

export type DataResourceInput =
  | string
  | (SharedResourceInput & {
      requestInit?: RequestInit
    })

export interface ResourceBuckets {
  images?: ImageResourceInput[]
  fonts?: FontResourceInput[]
  audio?: MediaResourceInput[]
  video?: MediaResourceInput[]
  lottie?: DataResourceInput[]
  json?: DataResourceInput[]
  text?: DataResourceInput[]
  binary?: DataResourceInput[]
}

export interface ResourceLoadContext {
  signal: AbortSignal
  onProgress?: (transfer: ResourceTransfer) => void
}

export interface ResourceCache {
  get(key: string): PromiseLike<unknown | undefined> | unknown | undefined
  set(key: string, value: unknown): PromiseLike<void> | void
}

export interface ResourceRuntimeOptions {
  maxConcurrentItems?: number
  retry?: RetryOptions
  cache?: ResourceCache
  loaders?: Partial<ResourceRuntimeLoaderRegistry>
  logger?: ResourceLogger
  logLevel?: LogLevel
}

export type ResourceRuntimeLoader = (
  item: NormalizedItem,
  context: ResourceLoadContext,
) => PromiseLike<unknown> | unknown

export interface ResourceRuntimeLoaderRegistry {
  image: ResourceRuntimeLoader
  font: ResourceRuntimeLoader
  audio: ResourceRuntimeLoader
  video: ResourceRuntimeLoader
  lottie: ResourceRuntimeLoader
  json: ResourceRuntimeLoader
  text: ResourceRuntimeLoader
  binary: ResourceRuntimeLoader
}

export interface NormalizedResourceItem {
  id: string
  bucket: ResourceBucketName
  type: ResourceType
  loaderKey: ResourceLoaderKey
  url: string
  optional: boolean
  dedupeKey: string
  source: {
    url: string
    optional?: boolean
    family?: string
    descriptors?: FontFaceDescriptors
    preload?: 'auto' | 'metadata' | 'none'
    crossOrigin?: '' | 'anonymous' | 'use-credentials'
    requestInit?: RequestInit
  }
  family?: string
  descriptors?: FontFaceDescriptors
  preload?: 'auto' | 'metadata' | 'none'
  crossOrigin?: '' | 'anonymous' | 'use-credentials'
  requestInit?: RequestInit
}

export type ResourceLoader = (
  item: NormalizedResourceItem,
  context: ResourceLoadContext,
) => PromiseLike<unknown> | unknown

export interface ResourceLoaderRegistry {
  image: ResourceLoader
  font: ResourceLoader
  audio: ResourceLoader
  video: ResourceLoader
  lottie: ResourceLoader
  json: ResourceLoader
  text: ResourceLoader
  binary: ResourceLoader
}

export interface ResourceFailure {
  category: ResourceFailureCategory
  code: string
  status?: number
  retriable: boolean
  message: string
  cause: unknown
  url: string
  type: ResourceType
  attempt: number
}

export interface ResourceItemSnapshot {
  id: string
  url: string
  type: ResourceType
  status: ResourceItemStatus
  attempt: number
  startedAt: number | null
  endedAt: number | null
  duration: number | null
  fromCache: boolean
  transfer?: {
    loadedBytes: number
    totalBytes?: number
  }
  message?: string
  error?: ResourceFailure
}

export interface ResourceManagerSnapshot {
  status: ResourceManagerStatus
  startedAt: number | null
  endedAt: number | null
  total: number
  queued: number
  loading: number
  succeeded: number
  failed: number
  skipped: number
  completed: number
  progress: number
  activeItems: ResourceItemSnapshot[]
  recentlyCompleted: ResourceItemSnapshot[]
  errors: ResourceFailure[]
  warnings: ResourceWarning[]
}

export interface ResourceSessionStartedEvent {
  type: 'session-started'
  startedAt: number
  total: number
}

export interface ResourceItemSucceededEvent {
  type: 'item-succeeded'
  item: ResourceItemSnapshot
}

export interface ResourceItemStartedEvent {
  type: 'item-started'
  item: ResourceItemSnapshot
}

export interface ResourceItemProgressEvent {
  type: 'item-progress'
  item: ResourceItemSnapshot
}

export interface ResourceItemRetryingEvent {
  type: 'item-retrying'
  item: ResourceItemSnapshot
  failure: ResourceFailure
  retryAfterMs: number
}

export interface ResourceItemFailedEvent {
  type: 'item-failed'
  item: ResourceItemSnapshot
  failure: ResourceFailure
}

export interface ResourceWarningEvent {
  type: 'warning'
  warning: ResourceWarning
}

export interface ResourceSessionCompletedEvent {
  type: 'session-completed'
  result: CompletedPreloadResult
}

export interface ResourceSessionFailedEvent {
  type: 'session-failed'
  result: FailedPreloadResult
}

export interface ResourceSessionAbortedEvent {
  type: 'session-aborted'
  result: AbortedPreloadResult
}

export interface ResourceSessionResetEvent {
  type: 'session-reset'
}

export type ResourceManagerEvent =
  | ResourceSessionStartedEvent
  | ResourceItemStartedEvent
  | ResourceItemProgressEvent
  | ResourceItemSucceededEvent
  | ResourceItemRetryingEvent
  | ResourceItemFailedEvent
  | ResourceWarningEvent
  | ResourceSessionCompletedEvent
  | ResourceSessionFailedEvent
  | ResourceSessionAbortedEvent
  | ResourceSessionResetEvent

export interface ResourceManagerEventPayload {
  snapshot: ResourceManagerSnapshot
  event: ResourceManagerEvent
}

export type ResourceManagerSubscriber = (
  payload: ResourceManagerEventPayload,
) => void

export interface BasePreloadResult {
  total: number
  succeeded: number
  failed: number
  skipped: number
  duration: number
  items: ResourceItemSnapshot[]
  errors: ResourceFailure[]
  warnings: ResourceWarning[]
}

export type ResourceRunGroupStatus =
  | 'queued'
  | 'running'
  | 'ready'
  | 'completed'
  | 'failed'
  | 'skipped'

export interface ResourceRunGroupSnapshot {
  key: string
  blocking: boolean
  priority: number
  totalItems: number
  completedItems: number
  status: ResourceRunGroupStatus
  startedAt: number | null
  endedAt: number | null
}

export interface ResourceRunActiveItemSnapshot {
  key: string
  groupKey: string
  url: string
  type: ResourceType
  startedAt: number
}

export interface ResourceRunSnapshot {
  status: ResourceRunStatus
  startedAt: number | null
  readyAt: number | null
  endedAt: number | null
  progress: number
  groups: ResourceRunGroupSnapshot[]
  activeItems: ResourceRunActiveItemSnapshot[]
  errors: ResourceFailure[]
  warnings: ResourceWarning[]
}

export interface ResourceReadyResult {
  status: 'ready' | 'failed'
  startedAt: number | null
  readyAt: number | null
  progress: number
  groups: ResourceRunGroupSnapshot[]
  activeItems: ResourceRunActiveItemSnapshot[]
  errors: ResourceFailure[]
  warnings: ResourceWarning[]
}

export interface ResourceCompleteResult {
  status: 'completed' | 'failed'
  startedAt: number | null
  endedAt: number | null
  progress: number
  groups: ResourceRunGroupSnapshot[]
  activeItems: ResourceRunActiveItemSnapshot[]
  errors: ResourceFailure[]
  warnings: ResourceWarning[]
}

export interface CompletedPreloadResult extends BasePreloadResult {
  status: 'completed'
}

export interface FailedPreloadResult extends BasePreloadResult {
  status: 'failed'
}

export interface AbortedPreloadResult extends BasePreloadResult {
  status: 'aborted'
}

export type PreloadResult =
  | CompletedPreloadResult
  | FailedPreloadResult
  | AbortedPreloadResult

export interface ResourceManagerOptions {
  concurrency?: number
  logLevel?: LogLevel
  retry?: RetryOptions
  resetClearsCache?: boolean
  logger?: ResourceLogger
  loaders?: Partial<ResourceLoaderRegistry>
}
