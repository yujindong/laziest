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

export type ResourceManagerStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'failed'
  | 'aborted'

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
    loadedBytes?: number
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

export interface PreloadResult {
  status: 'completed' | 'failed' | 'aborted'
  total: number
  succeeded: number
  failed: number
  skipped: number
  duration: number
  items: ResourceItemSnapshot[]
  errors: ResourceFailure[]
  warnings: ResourceWarning[]
}

export interface ResourceManagerOptions {
  concurrency?: number
  logLevel?: LogLevel
  resetClearsCache?: boolean
  logger?: ResourceLogger
}
