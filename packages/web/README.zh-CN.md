# `@laziest/web`

面向浏览器运行时的 Web 工具集。

当前这个包主要提供 `ResourceManager`，用于预加载运行时资源，例如图片、字体、音频、视频、lottie JSON、JSON、文本和二进制文件。

## 特性

- 仅支持浏览器环境的资源预加载
- 按资源桶分组传入资源，而不是为每个资源单独声明类型
- 支持配置并发窗口
- 支持配置日志级别与自定义日志器
- 支持详细的进度快照与订阅事件
- 支持按失败类型分类并执行重试
- 支持实例级别去重与成功资源缓存复用
- 支持可选资源失败后仅告警并跳过，而不让整个会话失败

## 导入

```ts
import {
  ResourceManager,
  ResourcePreloadError,
  consoleResourceLogger,
  shouldLog,
} from '@laziest/web'
```

## 快速开始

`ResourceManager` 适合按场景或页面级预加载流程创建。处于同一场景中的多个组件应该共享同一个 manager 实例。

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

当所有必需资源都成功完成后，`preload()` 会 resolve，并返回完成结果。

只要任意一个必需资源进入最终失败状态，`preload()` 就会 reject，并抛出 `ResourcePreloadError`。

## 资源桶

资源按桶传入。桶本身就定义了资源类型，因此每个条目不需要再填写 `type` 字段。

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

支持的资源桶：

- `images`
- `fonts`
- `audio`
- `video`
- `lottie`
- `json`
- `text`
- `binary`

## 进度与状态

manager 本身就是共享状态容器。常见使用方式是：

- 在一个地方调用 `manager.preload()`
- 在另一个地方读取 `manager.getSnapshot()`
- 通过 `manager.subscribe()` 订阅实时变化

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

快照字段包括：

- `status`: `idle | running | completed | failed | aborted`
- `total`
- `queued`
- `loading`
- `succeeded`
- `failed`
- `skipped`
- `completed`
- `progress`: `0` 到 `1`
- `activeItems`: 当前正在加载的资源
- `recentlyCompleted`: 已经完成的资源
- `errors`
- `warnings`

常见事件类型包括：

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

## 错误处理

必需资源失败会让整个预加载会话失败。可选资源失败后会被转换为 warning，并进入 skipped 状态。

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

失败分类包括：

- `http`
- `network`
- `timeout`
- `abort`
- `decode`
- `parse`
- `unsupported`
- `unknown`

重要行为：

- 必需资源遇到 HTTP `404` 会直接作为最终失败，并让 `preload()` reject
- 可选资源通过 `optional: true` 声明，最终失败后会转为 skipped warning
- 瞬时失败会按重试策略决定是否重试
- `abort()` 会结束当前会话，并让挂起中的 preload promise reject

## 日志

可以通过 `logLevel` 控制输出，也可以注入自定义 logger。

```ts
const manager = new ResourceManager({
  logLevel: 'info',
})
```

可用级别：

- `silent`
- `error`
- `warn`
- `info`
- `debug`

也可以传入自定义 logger：

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

包内也导出了：

- `consoleResourceLogger`
- `shouldLog(currentLevel, targetLevel)`

## 并发与重试

使用 `concurrency` 限制同一时间处于加载中的资源数量。

```ts
const manager = new ResourceManager({
  concurrency: 6,
})
```

使用 `retry` 配置瞬时失败的重试行为。

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

默认重试语义：

- 会重试类似网络抖动这类瞬时失败
- 不会重试 `404` 这类永久性 HTTP 失败
- `unknown` 类型失败默认会重试一次，除非被 `shouldRetry` 覆盖

## 去重模型

去重范围是单个 `ResourceManager` 实例。

- 同一个 manager 内重复出现的等价资源会自动去重
- 当会话仍在运行时，重复调用相同资源集的 `preload()` 会复用同一个活动 promise
- 同一个 manager 之前已成功加载过的资源，在后续运行中会被视为缓存命中
- 不同 manager 实例之间不会共享内部状态

这是有意为之的设计。如果不同页面或场景需要彼此独立的预加载流程，就应该创建独立的 manager 实例。

## Abort 与 Reset

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
  // aborted session will reject
}

manager.reset()
```

行为说明：

- `abort()` 会停止当前活动会话
- `reset()` 会把可观察状态清回 `idle`
- 如果 `resetClearsCache` 为 `true`，`reset()` 还会清空成功资源缓存

## 自定义 Loader

内置 loader 已覆盖常见浏览器资源类型。如果需要，也可以通过 `loaders` 覆盖某些 loader 行为。

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

自定义 loader 建议遵守以下约定：

- 正确响应 `context.signal`
- 如果希望复用内置 HTTP 失败分类逻辑，HTTP 失败时直接抛出 `Response`
- 非 HTTP 失败直接抛出普通错误即可

## API 摘要

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

主要导出包括：

- `ResourceManager`
- `ResourcePreloadError`
- `consoleResourceLogger`
- `shouldLog`
- 所有公开的 resource-manager 类型定义

## 说明

- 仅支持浏览器环境，不用于 Node.js 或 SSR 侧的预加载执行。
- `lottie` 预加载只保证 JSON 资源已就绪，不负责创建 lottie 渲染实例。
- 字节级进度依赖底层浏览器的响应流与 `Content-Length` 等响应头信息。
