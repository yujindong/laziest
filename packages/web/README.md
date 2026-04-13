# `@laziest/web`

Browser-only runtime utilities for web applications.

This package currently provides a `ResourceManager` for preloading runtime assets such as images, fonts, audio, video, lottie JSON, JSON, text, and binary files.

## Features

- Browser-only resource preloading
- Resource input grouped by bucket instead of per-item type fields
- Configurable concurrency window
- Configurable log level and custom logger
- Detailed progress snapshots and subscription events
- Retry support with failure classification
- Instance-level deduplication and successful-resource cache reuse
- Optional resources that warn and skip instead of failing the session

## Import

```ts
import {
  ResourceManager,
  ResourcePreloadError,
  consoleResourceLogger,
  shouldLog,
} from '@laziest/web'
```

## Quick Start

`ResourceManager` is designed to be created per scene or per page-level preload workflow. Components in the same scene should share the same manager instance.

```ts
import { ResourceManager } from '@laziest/web'

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

When all required resources finish successfully, `preload()` resolves with a completed result.

If any required resource reaches a final failure, `preload()` rejects with `ResourcePreloadError`.

## Resource Buckets

Resources are passed by bucket. The bucket itself defines the resource type, so each item does not need its own `type` field.

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

## Progress And State

The manager itself is the shared state container. A common pattern is:

- call `manager.preload()` in one place
- read `manager.getSnapshot()` in another place
- subscribe with `manager.subscribe()` for live updates

```ts
const manager = new ResourceManager({ concurrency: 3 })

const unsubscribe = manager.subscribe(({ snapshot, event }) => {
  if (event.type === 'item-progress') {
    console.log('loading', event.item.url, event.item.transfer)
  }

  console.log('progress', snapshot.completed, '/', snapshot.total)
  console.log('currently loading', snapshot.activeItems.map((item) => item.url))
})

const current = manager.getSnapshot()
console.log(current.status)

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
- `activeItems`: items currently in progress
- `recentlyCompleted`: items that already finished
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

Required resources fail the preload session. Optional resources are converted into warnings and skipped.

```ts
import { ResourceManager, ResourcePreloadError } from '@laziest/web'

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

- HTTP `404` on a required resource is a final failure and rejects `preload()`
- optional resources use `optional: true` and become skipped warnings after final failure
- transient failures can retry based on retry policy
- `abort()` ends the active session and causes the pending preload promise to reject

## Logging

You can control output with `logLevel` or inject your own logger.

```ts
const manager = new ResourceManager({
  logLevel: 'info',
})
```

Available levels:

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

The package also exports:

- `consoleResourceLogger`
- `shouldLog(currentLevel, targetLevel)`

## Concurrency And Retry

Use `concurrency` to limit how many resources are actively loading at once.

```ts
const manager = new ResourceManager({
  concurrency: 6,
})
```

Use `retry` to tune transient failure handling.

```ts
const manager = new ResourceManager({
  retry: {
    maxRetries: 2,
    delayMs: 300,
    backoff: 'exponential',
    shouldRetry(failure, attempt) {
      if (failure.category === 'http' && failure.status === 429) {
        return attempt <= 3
      }

      return failure.retriable
    },
  },
})
```

Default retry intent:

- retries transient network-like failures
- does not retry permanent HTTP failures such as `404`
- retries `unknown` failures once by default unless `shouldRetry` overrides it

## Deduplication Model

Deduplication is per `ResourceManager` instance.

- repeated equivalent resources inside one manager are deduplicated automatically
- repeated `preload()` calls with the same resources while a session is still running reuse the same active promise
- resources already loaded successfully by the same manager are treated as cache hits on later runs
- different manager instances do not share internal state

This is intentional. If different pages or scenes need independent preload workflows, they should create independent manager instances.

## Abort And Reset

```ts
const manager = new ResourceManager({
  resetClearsCache: true,
})

const promise = manager.preload({
  images: ['/images/hero.webp'],
})

manager.abort()

try {
  await promise
} catch (error) {
  // aborted sessions reject
}

manager.reset()
```

Behavior:

- `abort()` stops the active session
- `reset()` clears the observable state back to `idle`
- if `resetClearsCache` is `true`, `reset()` also clears successful-resource cache

## Custom Loaders

Built-in loaders cover the standard browser resource types. If needed, you can override specific loader behavior through `loaders`.

```ts
const manager = new ResourceManager({
  loaders: {
    json: async (item, context) => {
      const response = await fetch(item.url, {
        ...item.requestInit,
        signal: context.signal,
      })

      if (!response.ok) {
        throw response
      }

      return await response.json()
    },
  },
})
```

Custom loaders should:

- respect `context.signal`
- throw the `Response` object for HTTP failures if you want built-in HTTP classification
- throw normal errors for non-HTTP failures

## API Summary

```ts
class ResourceManager {
  constructor(options?: ResourceManagerOptions)

  preload(resources?: ResourceBuckets): Promise<CompletedPreloadResult>

  subscribe(listener: ResourceManagerSubscriber): () => void

  getSnapshot(): ResourceManagerSnapshot

  abort(): void

  reset(): void
}
```

Main exports:

- `ResourceManager`
- `ResourcePreloadError`
- `consoleResourceLogger`
- `shouldLog`
- all public resource-manager types

## Notes

- Browser-only. This package is not intended for Node.js or SSR preload execution.
- `lottie` preloading only guarantees the JSON payload is ready. It does not create a lottie renderer instance.
- Progress byte reporting depends on the underlying browser response stream and headers such as `Content-Length`.
