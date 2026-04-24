# `@laziest/resource-manager`

Browser-only resource loading with static plans, priority scheduling, blocking groups, and background continuation.

`@laziest/resource-manager` lets you describe resources as a static plan, schedule them by group and item priority, wait for blocking groups, keep non-blocking groups loading in the background, and observe runtime progress through snapshots and subscriptions.

## Features

- Static `ResourcePlan` declarations
- Group-level and item-level priority
- Blocking groups for early application readiness
- Background groups that continue after `ready`
- Runtime snapshots and subscriptions
- Retry support with failure classification
- In-run deduplication and optional cross-run cache reuse
- Abort support for active runs
- Optional resources that warn instead of blocking readiness

## Installation

```bash
pnpm add @laziest/resource-manager
```

## Browser Compatibility

- Browser runtime with `fetch`, `AbortController`, and `URL`
- `FontFace` support when loading fonts
- Media element preload support when loading audio or video

If your target browsers do not provide these APIs, load the polyfills before creating a `ResourceRuntime`.

```bash
pnpm add whatwg-fetch abortcontroller-polyfill core-js
```

```ts
import 'whatwg-fetch'
import 'abortcontroller-polyfill/dist/abortcontroller-polyfill-only'
import 'core-js/actual/url'
```

Notes:

- `whatwg-fetch` is a browser-only `fetch()` polyfill and should be loaded on the client
- `abortcontroller-polyfill` fills `AbortController` and `AbortSignal`; use the fetch patch entry only if your environment needs it
- `core-js/actual/url` can be used when `URL` is missing in older browsers
- If your app already injects polyfills through Babel, `@core-js/unplugin`, or another build step, prefer that single source of truth instead of importing them twice

## Quick Start

```ts
import {
  ResourceRuntime,
  createResourcePlan,
} from '@laziest/resource-manager'

const plan = createResourcePlan({
  groups: [
    {
      key: 'bootstrap',
      priority: 100,
      blocking: true,
      items: [
        { type: 'json', url: '/api/bootstrap.json' },
        { type: 'font', url: '/fonts/brand.woff2', family: 'Brand Sans' },
      ],
    },
    {
      key: 'hero',
      priority: 80,
      blocking: true,
      items: [{ type: 'image', url: '/images/hero.webp' }],
    },
    {
      key: 'background',
      priority: 10,
      blocking: false,
      items: [
        { type: 'image', url: '/images/gallery-1.webp', optional: true },
        { type: 'video', url: '/video/loop.mp4', optional: true },
      ],
    },
  ],
})

const runtime = new ResourceRuntime(plan, {
  maxConcurrentItems: 4,
  retry: { maxRetries: 2, delayMs: 250, backoff: 'exponential' },
})

const run = runtime.start()

await run.waitForReady()
renderApp()

await run.waitForAll()
```

`waitForReady()` resolves when every blocking group has completed all required resources. Non-blocking groups may still be loading.

`waitForAll()` resolves after every group has reached a terminal state.

## Plans

A plan is a static declaration. Each group is a scheduling and readiness unit.

```ts
const plan = createResourcePlan({
  groups: [
    {
      key: 'critical',
      priority: 100,
      blocking: true,
      items: [
        { type: 'image', url: '/images/logo.png', priority: 100 },
        { type: 'json', url: '/data/app.json', priority: 80 },
      ],
    },
    {
      key: 'later',
      priority: 10,
      blocking: false,
      items: [{ type: 'image', url: '/images/gallery.png' }],
    },
  ],
})
```

Scheduling order is deterministic:

- higher `group.priority`
- higher `item.priority`
- declaration order

`blocking` and `optional` are separate concepts:

- `blocking: true` means the group is required before runtime readiness
- `optional: true` means a resource failure becomes a warning instead of failing its group

`maxConcurrentItems` limits the number of actively loading items in a run. Priorities decide queue order; they do not preempt items that have already started.

## Resource Items

Every item has a `type` and `url`.

```ts
const items = [
  { type: 'image', url: '/images/hero.webp' },
  { type: 'font', url: '/fonts/brand.woff2', family: 'Brand Sans' },
  { type: 'audio', url: '/audio/click.mp3', preload: 'auto' },
  { type: 'video', url: '/video/intro.mp4', preload: 'metadata' },
  { type: 'json', url: '/api/bootstrap.json' },
  { type: 'text', url: '/copy/legal.txt' },
  { type: 'binary', url: '/models/mesh.bin' },
  { type: 'lottie', url: '/animations/intro.json' },
] as const
```

Supported types:

- `image`
- `font`
- `audio`
- `video`
- `lottie`
- `json`
- `text`
- `binary`

## Observing A Run

```ts
const run = runtime.start()

const unsubscribe = run.subscribe(({ snapshot }) => {
  console.log(snapshot.status)
  console.log(snapshot.progress)
  console.log(snapshot.groups)
})

try {
  await run.waitForReady()
  await run.waitForAll()
} finally {
  unsubscribe()
}
```

Run statuses:

- `idle`
- `running`
- `ready`
- `completed`
- `failed`
- `aborted`

Snapshot fields include:

- `status`
- `startedAt`
- `readyAt`
- `endedAt`
- `progress`
- `groups`
- `activeItems`
- `errors`
- `warnings`

## Cache, Retry, And Abort

```ts
const cache = new Map<string, unknown>()

const runtime = new ResourceRuntime(plan, {
  cache: {
    get: (key) => cache.get(key),
    set: (key, value) => void cache.set(key, value),
  },
  retry: {
    maxRetries: 2,
    delayMs: 200,
    backoff: 'linear',
  },
})

const run = runtime.start()

setTimeout(() => {
  run.abort()
}, 5000)
```

Runtime behavior:

- repeated resources in the same run are loaded once and fanned out to all matching items
- provided caches are reused across runs
- cache keys use normalized loader-relevant resource config
- transient failures retry according to the configured policy
- aborting a run moves its snapshot to `aborted` and rejects pending waiters

## Error Handling

```ts
import {
  ResourceRunError,
  ResourceRuntime,
  createResourcePlan,
} from '@laziest/resource-manager'

const run = new ResourceRuntime(plan).start()

try {
  await run.waitForReady()
} catch (error) {
  if (error instanceof ResourceRunError) {
    console.error(run.getSnapshot().errors)
  } else {
    throw error
  }
}
```

Failure categories include:

- `http`
- `network`
- `timeout`
- `abort`
- `decode`
- `parse`
- `unsupported`
- `unknown`
