# Web Resource Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-only `ResourceManager` in `@laziest/web` that preloads scene-scoped runtime assets with progress snapshots, subscriptions, bounded concurrency, instance-level deduplication, log levels, and structured retry/error handling.

**Architecture:** The public entry point is a `ResourceManager` class exported from `packages/web/src/index.ts`. Internally, the package is split into focused modules for types, normalization, retry/error classification, logging, queue/session orchestration, and resource loaders. The manager owns a single active session at a time and exposes manager-level observation APIs; each `preload()` call delegates to an internal session object that produces the thenable result and mutates the current snapshot.

**Tech Stack:** TypeScript, `tsdown`, Vitest, DOM browser APIs, jsdom test environment.

---

## File Structure

- Create: `packages/web/vitest.config.ts`
- Modify: `package.json`
- Modify: `packages/web/package.json`
- Modify: `packages/web/tsconfig.json`
- Modify: `packages/web/src/index.ts`
- Create: `packages/web/src/resource-manager/types.ts`
- Create: `packages/web/src/resource-manager/errors.ts`
- Create: `packages/web/src/resource-manager/logger.ts`
- Create: `packages/web/src/resource-manager/normalize.ts`
- Create: `packages/web/src/resource-manager/retry.ts`
- Create: `packages/web/src/resource-manager/queue.ts`
- Create: `packages/web/src/resource-manager/session.ts`
- Create: `packages/web/src/resource-manager/resource-manager.ts`
- Create: `packages/web/src/resource-manager/loaders/types.ts`
- Create: `packages/web/src/resource-manager/loaders/image-loader.ts`
- Create: `packages/web/src/resource-manager/loaders/font-loader.ts`
- Create: `packages/web/src/resource-manager/loaders/media-loader.ts`
- Create: `packages/web/src/resource-manager/loaders/fetch-loader.ts`
- Create: `packages/web/src/resource-manager/loaders/index.ts`
- Create: `packages/web/test/helpers/deferred.ts`
- Create: `packages/web/test/helpers/fakes.ts`
- Create: `packages/web/test/resource-manager.spec.ts`
- Create: `packages/web/test/retry-and-errors.spec.ts`
- Create: `packages/web/test/loaders.spec.ts`

Responsibilities:

- `types.ts`: public and internal types shared across the feature
- `errors.ts`: `ResourcePreloadError`, failure categories, and failure factories
- `logger.ts`: log-level filtering and default logger adapter
- `normalize.ts`: bucket input normalization and deduplication key generation
- `retry.ts`: retryability rules and backoff calculation
- `queue.ts`: bounded concurrency executor
- `session.ts`: single preload-run orchestration, snapshot mutation, subscriptions, abort flow
- `resource-manager.ts`: public class, cache/inflight ownership, single-active-session behavior
- `loaders/*`: resource-type-specific loader implementations and loader registry
- `test/*`: TDD coverage and browser API fakes

### Task 1: Add Test Infrastructure For `@laziest/web`

**Files:**
- Modify: `package.json`
- Modify: `packages/web/package.json`
- Modify: `packages/web/tsconfig.json`
- Create: `packages/web/vitest.config.ts`

- [ ] **Step 1: Write the failing test command expectation**

Document the first failing command by trying to run a package test command that does not exist yet:

```bash
pnpm --filter @laziest/web test
```

Expected: command fails because `test` script and Vitest config are missing.

- [ ] **Step 2: Run the command to verify the red state**

Run:

```bash
pnpm --filter @laziest/web test
```

Expected: FAIL with a missing-script error from `pnpm`.

- [ ] **Step 3: Add the minimal testing setup**

Update the root `package.json` devDependencies and scripts:

```json
{
  "scripts": {
    "build:web": "pnpm --filter @laziest/web build",
    "test:web": "pnpm --filter @laziest/web test"
  },
  "devDependencies": {
    "jsdom": "^26.1.0",
    "tsdown": "^0.21.7",
    "typescript": "^6.0.2",
    "vitest": "^3.2.4"
  }
}
```

Update `packages/web/package.json`:

```json
{
  "scripts": {
    "build": "tsdown",
    "test": "vitest run"
  }
}
```

Update `packages/web/tsconfig.json` include list:

```json
{
  "include": ["src", "test", "tsdown.config.ts", "vitest.config.ts"]
}
```

Create `packages/web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.spec.ts'],
    restoreMocks: true,
    clearMocks: true,
  },
})
```

- [ ] **Step 4: Run the package test command to verify the green base**

Run:

```bash
pnpm --filter @laziest/web test
```

Expected: PASS with `No test files found`, or PASS after later tasks add tests.

- [ ] **Step 5: Commit**

```bash
git add package.json packages/web/package.json packages/web/tsconfig.json packages/web/vitest.config.ts
git commit -m "test: add web package vitest setup"
```

### Task 2: Define Public Types And The First Idle Snapshot

**Files:**
- Create: `packages/web/src/resource-manager/types.ts`
- Create: `packages/web/src/resource-manager/errors.ts`
- Create: `packages/web/src/resource-manager/logger.ts`
- Create: `packages/web/src/resource-manager/resource-manager.ts`
- Modify: `packages/web/src/index.ts`
- Create: `packages/web/test/resource-manager.spec.ts`

- [ ] **Step 1: Write the failing test for the initial manager shape**

Create `packages/web/test/resource-manager.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ResourceManager } from '../src'

describe('ResourceManager', () => {
  it('starts with an idle snapshot', () => {
    const manager = new ResourceManager()

    expect(manager.getSnapshot()).toMatchObject({
      status: 'idle',
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
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @laziest/web test packages/web/test/resource-manager.spec.ts
```

Expected: FAIL because `ResourceManager` is not exported yet.

- [ ] **Step 3: Implement minimal public types and idle-state manager**

Create `packages/web/src/resource-manager/types.ts` with the core enums and snapshot interfaces from the spec, including:

```ts
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
```

Create `packages/web/src/resource-manager/errors.ts`:

```ts
import type { PreloadResult } from './types'

export class ResourcePreloadError extends Error {
  readonly result: PreloadResult

  constructor(message: string, result: PreloadResult) {
    super(message)
    this.name = 'ResourcePreloadError'
    this.result = result
  }
}
```

Create `packages/web/src/resource-manager/logger.ts`:

```ts
import type { LogLevel, ResourceLogger } from './types'

const order: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
}

export function shouldLog(current: LogLevel, target: Exclude<LogLevel, 'silent'>): boolean {
  return order[current] >= order[target]
}

export const consoleResourceLogger: ResourceLogger = console
```

Create `packages/web/src/resource-manager/resource-manager.ts` with a constructor and `getSnapshot()` returning the idle shape.

Update `packages/web/src/index.ts`:

```ts
export { ResourceManager } from './resource-manager/resource-manager'
export type * from './resource-manager/types'
export { ResourcePreloadError } from './resource-manager/errors'
```

- [ ] **Step 4: Run the targeted test to verify it passes**

Run:

```bash
pnpm --filter @laziest/web test packages/web/test/resource-manager.spec.ts
```

Expected: PASS for the idle snapshot assertion.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/index.ts packages/web/src/resource-manager/types.ts packages/web/src/resource-manager/errors.ts packages/web/src/resource-manager/logger.ts packages/web/src/resource-manager/resource-manager.ts packages/web/test/resource-manager.spec.ts
git commit -m "feat: add web resource manager base types"
```

### Task 3: Normalize Bucket Input And Enforce Single Active Session Reuse

**Files:**
- Create: `packages/web/src/resource-manager/normalize.ts`
- Modify: `packages/web/src/resource-manager/resource-manager.ts`
- Modify: `packages/web/src/resource-manager/types.ts`
- Modify: `packages/web/test/resource-manager.spec.ts`

- [ ] **Step 1: Write the failing tests for bucket normalization and active-session reuse**

Append to `packages/web/test/resource-manager.spec.ts`:

```ts
import { deferred } from './helpers/deferred'

it('normalizes bucket inputs into the total count', async () => {
  const manager = new ResourceManager({
    loaders: {
      image: async () => undefined,
      json: async () => ({ ok: true }),
    },
  })

  await manager.preload({
    images: ['/a.png', { url: '/b.png', optional: true }],
    json: ['/data.json'],
  })

  expect(manager.getSnapshot()).toMatchObject({
    status: 'completed',
    total: 3,
    succeeded: 3,
    completed: 3,
  })
})

it('reuses the active preload session while running', async () => {
  const gate = deferred<void>()
  const manager = new ResourceManager({
    loaders: {
      image: async () => {
        await gate.promise
      },
    },
  })

  const first = manager.preload({ images: ['/hero.png'] })
  const second = manager.preload({ images: ['/hero.png'] })

  expect(first).toBe(second)

  gate.resolve()
  await first
})
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run:

```bash
pnpm --filter @laziest/web test packages/web/test/resource-manager.spec.ts
```

Expected: FAIL because `preload()` and normalization logic do not exist.

- [ ] **Step 3: Implement normalization and active-session reuse**

Create `packages/web/src/resource-manager/normalize.ts` with:

- bucket-to-item conversion for `images`, `fonts`, `audio`, `video`, `lottie`, `json`, `text`, `binary`
- string input coercion to `{ url }`
- stable `id` generation
- dedupe key generation such as `image|/hero.png` and `font|Brand Sans|/brand.woff2`

Extend `ResourceManagerOptions` with an internal-test-only `loaders` override:

```ts
export interface ResourceManagerOptions {
  concurrency?: number
  logLevel?: LogLevel
  retry?: RetryOptions
  resetClearsCache?: boolean
  logger?: ResourceLogger
  loaders?: Partial<ResourceLoaderRegistry>
}
```

Implement `preload()` in `resource-manager.ts` so that:

- it normalizes input
- it returns the same active thenable when `status === 'running'`
- it creates a placeholder session promise for the first call

The first implementation can still execute items sequentially; bounded concurrency comes in a later task.

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run:

```bash
pnpm --filter @laziest/web test packages/web/test/resource-manager.spec.ts
```

Expected: PASS for normalization count and session reuse.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/resource-manager/types.ts packages/web/src/resource-manager/normalize.ts packages/web/src/resource-manager/resource-manager.ts packages/web/test/resource-manager.spec.ts
git commit -m "feat: normalize web resource buckets"
```

### Task 4: Implement Structured Errors, Retry Rules, And Optional Resource Semantics

**Files:**
- Create: `packages/web/src/resource-manager/retry.ts`
- Modify: `packages/web/src/resource-manager/errors.ts`
- Modify: `packages/web/src/resource-manager/resource-manager.ts`
- Modify: `packages/web/src/resource-manager/types.ts`
- Create: `packages/web/test/retry-and-errors.spec.ts`

- [ ] **Step 1: Write the failing tests for 404 rejection, optional skip, and transient retry**

Create `packages/web/test/retry-and-errors.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ResourceManager, ResourcePreloadError } from '../src'

describe('retry and error handling', () => {
  it('rejects on required 404 failures', async () => {
    const manager = new ResourceManager({
      loaders: {
        json: async () => {
          throw new Response(null, { status: 404, statusText: 'Not Found' })
        },
      },
    })

    await expect(manager.preload({ json: ['/missing.json'] })).rejects.toBeInstanceOf(ResourcePreloadError)
  })

  it('marks optional failures as skipped with a warning', async () => {
    const manager = new ResourceManager({
      loaders: {
        image: async () => {
          throw new Response(null, { status: 404, statusText: 'Not Found' })
        },
      },
    })

    const result = await manager.preload({
      images: [{ url: '/optional.png', optional: true }],
    })

    expect(result).toMatchObject({
      status: 'completed',
      skipped: 1,
    })
    expect(result.warnings).toHaveLength(1)
  })

  it('retries transient failures before succeeding', async () => {
    let attempts = 0
    const manager = new ResourceManager({
      retry: { maxRetries: 2, delayMs: 0, backoff: 'fixed' },
      loaders: {
        json: async () => {
          attempts += 1
          if (attempts < 3) {
            throw new TypeError('Failed to fetch')
          }
          return { ok: true }
        },
      },
    })

    const result = await manager.preload({ json: ['/flaky.json'] })

    expect(result.succeeded).toBe(1)
    expect(attempts).toBe(3)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @laziest/web test packages/web/test/retry-and-errors.spec.ts
```

Expected: FAIL because the manager does not yet classify failures or retry.

- [ ] **Step 3: Implement structured failures and retry policy**

Create `packages/web/src/resource-manager/retry.ts` with:

```ts
export function isRetriableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}
```

Implement a failure factory in `errors.ts` that converts `Response`, `DOMException`, `TypeError`, and unknown errors into:

```ts
{
  category: 'http' | 'network' | 'timeout' | 'abort' | 'decode' | 'parse' | 'unsupported' | 'unknown',
  code: 'HTTP_404' | 'NETWORK_ERROR' | 'TIMEOUT' | 'ABORTED' | 'UNKNOWN_ERROR',
  retriable: boolean,
  ...
}
```

Extend `resource-manager.ts` execution flow so that:

- required final failures reject with `ResourcePreloadError`
- optional final failures become `skipped` and append a warning
- retry attempts obey `RetryOptions`

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @laziest/web test packages/web/test/retry-and-errors.spec.ts
```

Expected: PASS for required reject, optional skip, and transient retry.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/resource-manager/types.ts packages/web/src/resource-manager/errors.ts packages/web/src/resource-manager/retry.ts packages/web/src/resource-manager/resource-manager.ts packages/web/test/retry-and-errors.spec.ts
git commit -m "feat: add web resource retry and error handling"
```

### Task 5: Add Snapshot Events, Logging, And Abort/Reset Behavior

**Files:**
- Modify: `packages/web/src/resource-manager/logger.ts`
- Modify: `packages/web/src/resource-manager/resource-manager.ts`
- Modify: `packages/web/src/resource-manager/types.ts`
- Modify: `packages/web/test/resource-manager.spec.ts`

- [ ] **Step 1: Write the failing tests for subscription payloads and lifecycle controls**

Append to `packages/web/test/resource-manager.spec.ts`:

```ts
it('emits snapshot plus event payloads to subscribers', async () => {
  const events: string[] = []
  const manager = new ResourceManager({
    loaders: {
      image: async () => undefined,
    },
  })

  const unsubscribe = manager.subscribe(({ event, snapshot }) => {
    events.push(event.type)
    expect(snapshot.total).toBeGreaterThanOrEqual(1)
  })

  await manager.preload({ images: ['/hero.png'] })
  unsubscribe()

  expect(events).toContain('session-started')
  expect(events).toContain('item-succeeded')
  expect(events).toContain('session-completed')
})

it('aborts the active session and resets to idle', async () => {
  const gate = deferred<void>()
  const manager = new ResourceManager({
    loaders: {
      image: async ({ signal }) => {
        signal.throwIfAborted()
        await gate.promise
      },
    },
  })

  const pending = manager.preload({ images: ['/hero.png'] })
  manager.abort('route-change')
  gate.resolve()

  await expect(pending).rejects.toBeInstanceOf(Error)
  expect(manager.getSnapshot().status).toBe('aborted')

  manager.reset()
  expect(manager.getSnapshot().status).toBe('idle')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @laziest/web test packages/web/test/resource-manager.spec.ts
```

Expected: FAIL because subscriptions, abort, and reset are not complete.

- [ ] **Step 3: Implement event emission, logging, and lifecycle controls**

Update `types.ts` with event types:

```ts
export type ResourceManagerEvent =
  | { type: 'session-started' }
  | { type: 'item-started'; item: ResourceItemSnapshot }
  | { type: 'item-succeeded'; item: ResourceItemSnapshot }
  | { type: 'item-failed'; item: ResourceItemSnapshot; failure: ResourceFailure }
  | { type: 'item-retrying'; item: ResourceItemSnapshot; failure: ResourceFailure }
  | { type: 'session-completed'; result: PreloadResult }
  | { type: 'session-failed'; result: PreloadResult }
  | { type: 'session-aborted'; result: PreloadResult }
  | { type: 'warning'; warning: ResourceWarning }
```

Implement listener registration, event broadcasting, and log-level filtered logger calls in `resource-manager.ts` and `logger.ts`. Use `AbortController` per session and ensure `reset()` clears subscriber-visible state without removing subscribers.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @laziest/web test packages/web/test/resource-manager.spec.ts
```

Expected: PASS for event payloads, abort, and reset behavior.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/resource-manager/types.ts packages/web/src/resource-manager/logger.ts packages/web/src/resource-manager/resource-manager.ts packages/web/test/resource-manager.spec.ts
git commit -m "feat: add web resource manager subscriptions"
```

### Task 6: Add Bounded Concurrency, Inflight Deduplication, And Success Cache Reuse

**Files:**
- Create: `packages/web/src/resource-manager/queue.ts`
- Create: `packages/web/src/resource-manager/session.ts`
- Modify: `packages/web/src/resource-manager/resource-manager.ts`
- Modify: `packages/web/test/resource-manager.spec.ts`
- Create: `packages/web/test/helpers/deferred.ts`

- [ ] **Step 1: Write the failing tests for concurrency and deduplication**

Create `packages/web/test/helpers/deferred.ts`:

```ts
export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
```

Append to `packages/web/test/resource-manager.spec.ts`:

```ts
it('never exceeds the configured concurrency window', async () => {
  const gates = [deferred<void>(), deferred<void>(), deferred<void>()]
  let active = 0
  let maxActive = 0

  const manager = new ResourceManager({
    concurrency: 2,
    loaders: {
      image: async ({ url }) => {
        const index = Number(url.match(/(\\d+)/)?.[1]) - 1
        active += 1
        maxActive = Math.max(maxActive, active)
        await gates[index].promise
        active -= 1
      },
    },
  })

  const pending = manager.preload({
    images: ['/1.png', '/2.png', '/3.png'],
  })

  gates[0].resolve()
  gates[1].resolve()
  gates[2].resolve()
  await pending

  expect(maxActive).toBe(2)
})

it('deduplicates repeated resources inside one manager instance', async () => {
  let calls = 0
  const manager = new ResourceManager({
    loaders: {
      image: async () => {
        calls += 1
      },
    },
  })

  await manager.preload({ images: ['/hero.png', '/hero.png'] })
  await manager.preload({ images: ['/hero.png'] })

  expect(calls).toBe(1)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @laziest/web test packages/web/test/resource-manager.spec.ts
```

Expected: FAIL because execution is still sequential and uncached.

- [ ] **Step 3: Implement queue/session orchestration and deduplication**

Create `packages/web/src/resource-manager/queue.ts` with a bounded runner:

```ts
export async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  // start up to concurrency workers, then drain
}
```

Create `packages/web/src/resource-manager/session.ts` to own:

- per-run `AbortController`
- current normalized items
- inflight promise map
- snapshot mutation helpers
- final result creation

Update `resource-manager.ts` so the manager owns:

- `successfulResources: Map<string, unknown>`
- `activeSession: PreloadSession | null`

Use normalization keys to:

- attach duplicates in the current session to one inflight promise
- satisfy future sessions from `successfulResources`

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @laziest/web test packages/web/test/resource-manager.spec.ts
```

Expected: PASS for concurrency capping and instance-level deduplication.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/resource-manager/queue.ts packages/web/src/resource-manager/session.ts packages/web/src/resource-manager/resource-manager.ts packages/web/test/helpers/deferred.ts packages/web/test/resource-manager.spec.ts
git commit -m "feat: add web resource queue and deduplication"
```

### Task 7: Implement Built-In Loaders And Verify Browser Resource Behavior

**Files:**
- Create: `packages/web/src/resource-manager/loaders/types.ts`
- Create: `packages/web/src/resource-manager/loaders/image-loader.ts`
- Create: `packages/web/src/resource-manager/loaders/font-loader.ts`
- Create: `packages/web/src/resource-manager/loaders/media-loader.ts`
- Create: `packages/web/src/resource-manager/loaders/fetch-loader.ts`
- Create: `packages/web/src/resource-manager/loaders/index.ts`
- Create: `packages/web/test/helpers/fakes.ts`
- Create: `packages/web/test/loaders.spec.ts`
- Modify: `packages/web/src/resource-manager/resource-manager.ts`

- [ ] **Step 1: Write the failing loader tests**

Create `packages/web/test/loaders.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLoaderRegistry } from '../src/resource-manager/loaders'

describe('built-in loaders', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('loads json via fetch and parse', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 })))
    const loaders = createLoaderRegistry()

    await expect(loaders.json({ url: '/data.json', signal: new AbortController().signal })).resolves.toEqual({ ok: true })
  })

  it('loads fonts through FontFace and document.fonts', async () => {
    const add = vi.fn()
    vi.stubGlobal('FontFace', class {
      family: string
      source: string
      constructor(family: string, source: string) {
        this.family = family
        this.source = source
      }
      load() {
        return Promise.resolve(this)
      }
    })
    Object.defineProperty(document, 'fonts', {
      value: { add },
      configurable: true,
    })

    const loaders = createLoaderRegistry()
    await loaders.font({
      family: 'Brand Sans',
      url: '/brand.woff2',
      signal: new AbortController().signal,
    })

    expect(add).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm --filter @laziest/web test packages/web/test/loaders.spec.ts
```

Expected: FAIL because no loader registry exists.

- [ ] **Step 3: Implement the built-in loaders**

Create a shared loader contract in `loaders/types.ts`:

```ts
export interface LoaderContext {
  url: string
  signal: AbortSignal
  descriptors?: FontFaceDescriptors
  family?: string
  preload?: 'auto' | 'metadata' | 'none'
  crossOrigin?: '' | 'anonymous' | 'use-credentials'
  requestInit?: RequestInit
}
```

Implement:

- `image-loader.ts`: `Image` event-based loader
- `font-loader.ts`: `FontFace` + `document.fonts.add`
- `media-loader.ts`: shared audio/video element loader
- `fetch-loader.ts`: JSON, text, binary, and lottie data loaders with HTTP status validation
- `loaders/index.ts`: `createLoaderRegistry()`

Then wire `resource-manager.ts` to use the default registry when no override loaders are provided.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @laziest/web test packages/web/test/loaders.spec.ts
```

Expected: PASS for fetch-backed and font-backed loaders. Add image/media cases if jsdom stubbing is stable.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/resource-manager/loaders/types.ts packages/web/src/resource-manager/loaders/image-loader.ts packages/web/src/resource-manager/loaders/font-loader.ts packages/web/src/resource-manager/loaders/media-loader.ts packages/web/src/resource-manager/loaders/fetch-loader.ts packages/web/src/resource-manager/loaders/index.ts packages/web/test/loaders.spec.ts packages/web/src/resource-manager/resource-manager.ts
git commit -m "feat: add built-in web resource loaders"
```

### Task 8: Export The Final API And Run Full Verification

**Files:**
- Modify: `packages/web/src/index.ts`
- Modify: `packages/web/package.json`
- Test: `packages/web/test/resource-manager.spec.ts`
- Test: `packages/web/test/retry-and-errors.spec.ts`
- Test: `packages/web/test/loaders.spec.ts`

- [ ] **Step 1: Write the final failing package-shape check**

Add a final export assertion to `packages/web/test/resource-manager.spec.ts`:

```ts
import { ResourceManager, ResourcePreloadError } from '../src'

it('exports the public resource manager api', () => {
  expect(ResourceManager).toBeTypeOf('function')
  expect(ResourcePreloadError).toBeTypeOf('function')
})
```

- [ ] **Step 2: Run the specific test to verify it fails if exports are incomplete**

Run:

```bash
pnpm --filter @laziest/web test packages/web/test/resource-manager.spec.ts
```

Expected: FAIL if any export is missing or misnamed.

- [ ] **Step 3: Finalize exports and package metadata**

Ensure `packages/web/src/index.ts` exports:

```ts
export { ResourceManager } from './resource-manager/resource-manager'
export { ResourcePreloadError } from './resource-manager/errors'
export type * from './resource-manager/types'
```

Ensure `packages/web/package.json` still points to `dist/index.*` and does not need additional export entries because the whole API is rooted at `src/index.ts`.

- [ ] **Step 4: Run full verification**

Run:

```bash
pnpm --filter @laziest/web test
pnpm --filter @laziest/web build
```

Expected:

- Vitest PASS for all three spec files
- `tsdown` build PASS with ESM, CJS, and declaration output

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/index.ts packages/web/package.json packages/web/test/resource-manager.spec.ts packages/web/test/retry-and-errors.spec.ts packages/web/test/loaders.spec.ts
git commit -m "feat: ship web resource manager"
```

## Self-Review

Spec coverage check:

- Browser-only runtime: covered by built-in loader tasks and jsdom tests
- Scene-scoped manager with single active session: covered by Tasks 2, 3, 5, and 6
- Bucket input grouped by type: covered by Task 3
- Progress snapshots and subscription model: covered by Tasks 2 and 5
- Structured errors, warnings, and HTTP 404 rejection: covered by Task 4
- Optional resource semantics: covered by Task 4
- Log level handling: covered by Task 5
- Concurrency window and instance-level deduplication: covered by Task 6
- Built-in loaders for image, font, media, lottie/data resources: covered by Task 7
- Public exports and build verification: covered by Task 8

Placeholder scan:

- No `TODO`, `TBD`, or "handle later" placeholders remain
- Each task includes exact files, test commands, and implementation snippets

Type consistency check:

- `ResourceManager`, `ResourcePreloadError`, `PreloadResult`, and event names match the design doc
- Retry terminology consistently uses `RetryOptions`, `ResourceFailure`, and `ResourceWarning`

