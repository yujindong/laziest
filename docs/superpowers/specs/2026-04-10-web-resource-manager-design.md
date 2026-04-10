# Web Resource Manager Design

**Date:** 2026-04-10

## Goal

Add a browser-only resource manager to `@laziest/web` that preloads runtime assets such as images, fonts, audio, video, lottie payloads, JSON, text, and binary files. The manager must provide configurable logging, bounded concurrency, detailed progress state, automatic deduplication within a manager instance, and retry behavior that distinguishes permanent failures such as HTTP 404 from transient failures such as network instability.

## Scope

This design covers:

- Public API for a browser-side `ResourceManager`
- Input model for resource buckets grouped by type
- Session lifecycle and instance behavior
- Progress snapshot and subscription model
- Error classification, warning semantics, and retry rules
- Internal loading architecture for built-in browser resource types

This design does not cover:

- Node.js, SSR, service worker, or mini-app runtimes
- Cross-instance shared state or global task registries
- Persistent cache layers beyond normal browser HTTP caching
- UI components for visualizing progress

## Constraints

- Browser runtime only
- One scene should create and own one `ResourceManager` instance
- A `ResourceManager` instance represents the current preload workflow for that scene
- Different components in the same scene should observe the same manager instance rather than pass task handles around
- Input should be grouped by resource type bucket instead of requiring a type field on every item
- A missing required resource such as HTTP 404 should reject the preload operation

## Recommended Approach

### Option A: Scene-scoped `ResourceManager` class with internal single active session

Expose a stateful `ResourceManager` class. Each scene creates its own instance and uses it as the single access point for preload execution, progress subscriptions, cancellation, and snapshot reads. Internally, each `preload()` call is executed by a private session object, but only one session can be active at a time per manager.

Pros:

- Matches the user's scene-level ownership model
- Makes it easy for different components to observe the same progress state through the shared manager instance
- Keeps APIs small because no task key or global registry is needed
- Keeps long-lived state such as cache, inflight deduplication, subscribers, and config in one obvious place

Cons:

- A manager is intentionally not a general-purpose task multiplexer
- Running multiple unrelated preload sessions at the same time requires separate manager instances

### Option B: Manager with multiple keyed tasks

Expose a manager that can hold many named tasks and let callers subscribe by task key.

Pros:

- Supports many parallel workflows inside a single instance

Cons:

- Adds task identifiers, lookup APIs, and extra lifecycle complexity
- Does not match the intended ownership model because scenes already create distinct manager instances

### Option C: Stateless preload function plus external store

Expose a pure preload function and require callers to provide or manage external state.

Pros:

- Minimal core API surface

Cons:

- Pushes lifecycle and subscription complexity to consumers
- Loses the benefits of scene-scoped state and built-in deduplication

### Recommendation

Use Option A. It matches the intended usage model, keeps the public API tight, and avoids unnecessary cross-task abstractions.

## Public API Design

### Main Class

```ts
type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug'

interface ResourceManagerOptions {
  concurrency?: number
  logLevel?: LogLevel
  retry?: RetryOptions
  resetClearsCache?: boolean
  logger?: ResourceLogger
}

declare class ResourceManager {
  constructor(options?: ResourceManagerOptions)

  preload(
    resources: ResourceBuckets,
    options?: PreloadOptions
  ): PromiseLike<PreloadResult>

  subscribe(listener: ResourceManagerListener): () => void

  getSnapshot(): ResourceManagerSnapshot

  abort(reason?: string): void

  reset(): void
}
```

### Input Model

Callers provide resource buckets grouped by type:

```ts
interface ResourceBuckets {
  images?: ImageResourceInput[]
  fonts?: FontResourceInput[]
  audio?: MediaResourceInput[]
  video?: MediaResourceInput[]
  lottie?: DataResourceInput[]
  json?: DataResourceInput[]
  text?: DataResourceInput[]
  binary?: DataResourceInput[]
}
```

Representative input shapes:

```ts
type StringResource = string

interface SharedResourceInput {
  url: string
  optional?: boolean
}

type ImageResourceInput = StringResource | SharedResourceInput

interface FontResourceInput extends SharedResourceInput {
  family: string
  descriptors?: FontFaceDescriptors
}

interface MediaResourceInput extends SharedResourceInput {
  preload?: 'auto' | 'metadata' | 'none'
  crossOrigin?: '' | 'anonymous' | 'use-credentials'
}

interface DataResourceInput extends SharedResourceInput {
  requestInit?: RequestInit
}
```

Input is normalized internally into a unified resource item model, but callers do not provide `type` per item because bucket membership already carries that information.

### Session Behavior

- A manager has at most one active preload session at a time
- If `preload()` is called while the current session is still running, the manager returns the same active thenable result and logs that the current session is being reused
- If the previous session already ended, `preload()` starts a new session and replaces the manager's current snapshot
- `abort()` cancels the active session
- `reset()` clears current session state and optionally clears successful resource cache depending on `resetClearsCache`

### Promise Semantics

`preload()` returns a thenable object so callers can write:

```ts
await manager.preload({
  images: ['/hero.webp'],
  fonts: [{ family: 'Brand Sans', url: '/brand-sans.woff2' }],
})
```

Resolution rules:

- Resolve when all required resources finish successfully, with optional resources either successful or skipped after acceptable failure handling
- Reject when at least one required resource reaches a final failed state, including HTTP 404
- Reject with a typed preload error that still carries the full `PreloadResult`

## Progress Model

### Snapshot Shape

`getSnapshot()` returns the current authoritative state for the manager:

```ts
type ResourceManagerStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'failed'
  | 'aborted'

interface ResourceManagerSnapshot {
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
```

Rationale:

- UI consumers need counts and progress ratio without reconstructing them
- `activeItems` answers "what is loading right now"
- `recentlyCompleted` supports progress lists without forcing consumers to diff the entire history
- `errors` and `warnings` provide structured summaries independent of console logging

### Item Snapshot Shape

```ts
type ResourceItemStatus =
  | 'queued'
  | 'loading'
  | 'succeeded'
  | 'failed'
  | 'skipped'

interface ResourceItemSnapshot {
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
```

### Subscription Model

```ts
type ResourceManagerListener = (
  payload: ResourceManagerEventPayload
) => void

interface ResourceManagerEventPayload {
  snapshot: ResourceManagerSnapshot
  event: ResourceManagerEvent
}
```

Event kinds:

- `session-started`
- `item-started`
- `item-progress`
- `item-succeeded`
- `item-failed`
- `item-retrying`
- `session-completed`
- `session-failed`
- `session-aborted`
- `warning`

Design rule:

- Snapshot is the source of truth
- Event explains what changed
- Consumers can safely mount late, call `getSnapshot()`, and then subscribe for updates

## Error Classification And Retry Design

### Structured Failure Model

```ts
type ResourceFailureCategory =
  | 'http'
  | 'network'
  | 'timeout'
  | 'abort'
  | 'decode'
  | 'parse'
  | 'unsupported'
  | 'unknown'

interface ResourceFailure {
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

interface ResourceWarning {
  code: string
  message: string
  url?: string
  type?: ResourceType
}
```

This structure avoids brittle string inspection and lets the retry layer, logger, and UI behave consistently.

### Retry Rules

Retry only transient failures by default:

- Retry: `network`, `timeout`, HTTP `408`, HTTP `429`, HTTP `5xx`
- Do not retry: HTTP `401`, `403`, `404`, `410`, `422`
- Do not retry: `abort`, `decode`, `parse`, `unsupported`
- Retry `unknown` once by default

Config shape:

```ts
interface RetryOptions {
  maxRetries?: number
  delayMs?: number
  backoff?: 'fixed' | 'linear' | 'exponential'
  shouldRetry?: (
    failure: ResourceFailure,
    item: ResourceItemSnapshot,
    attempt: number
  ) => boolean
}
```

404 handling:

- A required resource that fails with HTTP 404 reaches final failure without retry
- That failure is recorded in snapshot errors
- A warning may also be emitted for log visibility
- The overall preload promise rejects because a required resource failed

Optional resource handling:

- Any item can opt into `optional: true`
- If an optional item reaches final failure, the item becomes `skipped`
- The warning is still recorded
- The overall preload promise may still resolve if no required items fail

## Logging Design

### Log Levels

- `silent`: no logs
- `error`: session-level failures and final unrecoverable errors only
- `warn`: `error` plus non-retriable warnings such as 404 or decode failures
- `info`: `warn` plus session start, session end, reuse of active session, and retry activity
- `debug`: `info` plus per-item start, success, skip, cache hit, and scheduling details

### Logger Contract

```ts
interface ResourceLogger {
  error(message: string, context?: unknown): void
  warn(message: string, context?: unknown): void
  info(message: string, context?: unknown): void
  debug(message: string, context?: unknown): void
}
```

The manager should ship with a console-backed default logger but accept a custom logger for application-specific instrumentation.

Important separation:

- Logging is only a projection of state
- Warnings and failures always exist structurally in snapshot/result whether or not the current log level prints them

## Concurrency And Deduplication

### Concurrency Window

The manager runs loads through a bounded async queue controlled by `concurrency`. The scheduler should:

- Start up to `concurrency` items at once
- Immediately start the next queued item when one finishes
- Preserve accurate counts for `queued`, `loading`, and `completed`

### Instance-Level Deduplication

Deduplicate within a single manager instance only:

- If the same normalized resource is already successfully loaded in the manager cache, later loads mark `fromCache: true` and complete without creating duplicate work
- If the same normalized resource is already inflight in the active session, later references attach to the same underlying work instead of starting a duplicate request
- No cross-instance deduplication is implemented because browser HTTP caching already covers repeated URL fetches at the network layer

Normalization keys should include enough type-specific identity to avoid unsafe collisions. Examples:

- Image: `image|/hero.webp`
- Font: `font|Brand Sans|/brand-sans.woff2`
- Audio: `audio|/click.mp3`

## Built-In Loader Strategy

Built-in loader expectations:

- Images: load via `Image` element and resolve after `load`
- Fonts: load via `FontFace`, then register with `document.fonts`
- Audio and video: load metadata or enough data to treat the resource as ready, using element events and fetch where needed
- Lottie: fetch JSON payload and parse it; this manager only guarantees the data is ready, not that an animation library instance has been created
- JSON: fetch and parse JSON
- Text: fetch and read text
- Binary: fetch and read `ArrayBuffer`

The library should not bundle a lottie renderer. It only preloads the runtime resource needed by an external renderer.

## Result Model

```ts
interface PreloadResult {
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
```

When rejecting, throw a typed error such as:

```ts
class ResourcePreloadError extends Error {
  readonly result: PreloadResult
}
```

This keeps `try/catch` ergonomics while preserving structured detail.

## Testing Strategy

Required test areas:

- Manager starts from idle snapshot
- `preload()` updates session state and resolves on full success
- `preload()` rejects with `ResourcePreloadError` on required 404
- Optional resources convert final failure into warning plus skipped item
- Retry logic retries transient failures and stops on permanent failures
- Concurrency window never exceeds configured limit
- Repeated `preload()` while running reuses the current active session
- Instance-level deduplication avoids duplicate work for repeated resources
- Subscribers receive both snapshot and event payloads
- `abort()` transitions the session to aborted and rejects appropriately
- `reset()` clears observable state as designed

## Open Implementation Notes

- Prefer small internal modules by responsibility rather than a single large file
- Keep built-in resource loaders behind a common loader interface so new resource types remain isolated
- Use browser APIs directly and avoid framework-specific dependencies
- The initial version should focus on correctness and observability over aggressive optimization

## Final Recommendation

Implement a browser-only, scene-scoped `ResourceManager` class that owns one active preload session at a time, accepts resource buckets grouped by type, exposes manager-level progress subscriptions and snapshots, retries only transient failures, and rejects the preload promise on any required final failure including HTTP 404. This gives the library a clean browser runtime asset pipeline without introducing unnecessary global state or multi-task coordination complexity.
