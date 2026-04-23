# `@laziest/resource-manager`

Browser-only resource preloading for web applications.

`@laziest/resource-manager` helps you preload runtime assets such as images, fonts, audio, video, lottie JSON, JSON, text, and binary files with a single scene-scoped manager instance.

## Features

- Browser-only resource preloading
- Bucket-based input for images, fonts, audio, video, lottie, JSON, text, and binary assets
- Configurable concurrency
- Progress snapshots and subscription events
- Retry support with failure classification
- Configurable log level and custom logger
- Instance-level deduplication and successful-resource cache reuse
- Optional resources that warn and skip instead of failing the preload session

## Installation

```bash
pnpm add @laziest/resource-manager
```

## Quick Start

Create one `ResourceManager` per scene, route, or page-level preload workflow.

```ts
import { ResourceManager } from '@laziest/resource-manager'

const manager = new ResourceManager({
  concurrency: 4,
  logLevel: 'info',
})

await manager.preload({
  images: ['/images/hero.webp', '/images/logo.png'],
  fonts: [
    {
      family: 'Brand Sans',
      url: '/fonts/brand-sans.woff2',
    },
  ],
  audio: ['/audio/click.mp3'],
  lottie: ['/animations/intro.json'],
  json: ['/data/bootstrap.json'],
})
```

When all required resources succeed, `preload()` resolves with the completed result.

If any required resource reaches a final failure, `preload()` rejects with `ResourcePreloadError`.

## Resource Buckets

Resources are grouped by bucket. The bucket itself defines the resource type, so each item does not need a `type` field.

```ts
await manager.preload({
  images: [
    '/images/hero.webp',
    { url: '/images/banner.webp', optional: true },
  ],
  fonts: [
    {
      family: 'Brand Sans',
      url: '/fonts/brand-sans.woff2',
      descriptors: { weight: '400', style: 'normal' },
    },
  ],
  audio: [
    '/audio/click.mp3',
    {
      url: '/audio/bgm.mp3',
      preload: 'auto',
      crossOrigin: 'anonymous',
    },
  ],
  video: [
    {
      url: '/video/intro.mp4',
      preload: 'metadata',
    },
  ],
  lottie: ['/animations/intro.json'],
  json: [
    {
      url: '/api/bootstrap.json',
      requestInit: {
        headers: {
          Accept: 'application/json',
        },
      },
    },
  ],
  text: ['/copy/legal.txt'],
  binary: ['/models/mesh.bin'],
})
```

Supported buckets:

- `images`
- `fonts`
- `audio`
- `video`
- `lottie`
- `json`
- `text`
- `binary`

## Progress And Subscriptions

The manager is the shared state container for one preload workflow.

```ts
const manager = new ResourceManager({ concurrency: 3 })

const unsubscribe = manager.subscribe(({ snapshot, event }) => {
  if (event.type === 'item-progress') {
    console.log('loading', event.item.url, event.item.transfer)
  }

  console.log('progress', snapshot.completed, '/', snapshot.total)
  console.log('active', snapshot.activeItems.map((item) => item.url))
})

try {
  await manager.preload({
    images: ['/images/hero.webp'],
    json: ['/data/bootstrap.json'],
  })
} finally {
  unsubscribe()
}
```

Snapshot fields include:

- `status`: `idle | running | completed | failed | aborted`
- `total`
- `queued`
- `loading`
- `succeeded`
- `failed`
- `skipped`
- `completed`
- `progress`: `0` to `1`
- `activeItems`
- `recentlyCompleted`
- `errors`
- `warnings`

Common event types include:

- `session-started`
- `item-started`
- `item-progress`
- `item-succeeded`
- `item-retrying`
- `item-failed`
- `warning`
- `session-completed`
- `session-failed`
- `session-aborted`
- `session-reset`

## Error Handling

Required resources fail the preload session. Optional resources become warnings and skipped items.

```ts
import {
  ResourceManager,
  ResourcePreloadError,
} from '@laziest/resource-manager'

const manager = new ResourceManager()

try {
  await manager.preload({
    images: ['/images/hero.webp'],
    json: ['/data/bootstrap.json'],
  })
} catch (error) {
  if (error instanceof ResourcePreloadError) {
    console.error(error.result.status)
    console.error(error.result.errors)
    console.error(error.result.warnings)
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

Important behavior:

- HTTP `404` on a required resource is a final failure
- optional resources use `optional: true` and become skipped warnings after final failure
- transient failures can retry based on retry policy
- `abort()` ends the active session and rejects the pending preload promise

## Retry, Logging, Abort, And Reset

```ts
const manager = new ResourceManager({
  concurrency: 4,
  logLevel: 'debug',
  retry: {
    maxRetries: 2,
    delayMs: 250,
    backoff: 'exponential',
  },
})
```

Available log levels:

- `silent`
- `error`
- `warn`
- `info`
- `debug`

You can also provide a custom logger:

```ts
const manager = new ResourceManager({
  logLevel: 'debug',
  logger: {
    error(message, context) {
      console.error(message, context)
    },
    warn(message, context) {
      console.warn(message, context)
    },
    info(message, context) {
      console.info(message, context)
    },
    debug(message, context) {
      console.debug(message, context)
    },
  },
})
```

Lifecycle helpers:

- `abort()` cancels the active preload session
- `reset()` returns the manager to the idle snapshot
- `resetClearsCache: true` also clears the successful-resource cache

## API Exports

```ts
import {
  ResourceManager,
  ResourcePreloadError,
  consoleResourceLogger,
  shouldLog,
  type ResourceBuckets,
  type ResourceManagerSnapshot,
  type RetryOptions,
} from '@laziest/resource-manager'
```
