# `@laziest/resource-manager`

面向浏览器环境的资源预加载库。

`@laziest/resource-manager` 用一个按场景划分的管理器实例，统一预加载图片、字体、音频、视频、lottie JSON、JSON、文本和二进制资源。

## 特性

- 仅面向浏览器环境的资源预加载
- 按 bucket 分组的资源输入模型，支持图片、字体、音频、视频、lottie、JSON、文本和二进制资源
- 可配置并发数
- 进度快照与订阅事件
- 带失败分类的重试机制
- 可配置日志级别与自定义 logger
- 实例级去重与成功资源缓存复用
- 可选资源失败后只产生 warning 并跳过，不中断整体预加载

## 安装

```bash
pnpm add @laziest/resource-manager
```

## 快速开始

通常每个场景、路由或者页面级预加载流程创建一个 `ResourceManager` 实例。

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

当所有必需资源都加载成功时，`preload()` 会 resolve。

如果任意必需资源进入最终失败状态，`preload()` 会以 `ResourcePreloadError` reject。

## Resource Buckets

资源通过 bucket 分组传入，bucket 自身就代表资源类型，因此每个条目不需要单独再写 `type` 字段。

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

支持的 bucket：

- `images`
- `fonts`
- `audio`
- `video`
- `lottie`
- `json`
- `text`
- `binary`

## 进度与订阅

`ResourceManager` 本身就是单次预加载流程的共享状态容器。

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
- `activeItems`
- `recentlyCompleted`
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

必需资源失败会导致整个预加载流程失败。可选资源失败则会转成 warning 并标记为 skipped。

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

失败分类包括：

- `http`
- `network`
- `timeout`
- `abort`
- `decode`
- `parse`
- `unsupported`
- `unknown`

关键行为：

- 必需资源如果返回 HTTP `404`，会被视为最终失败
- 可选资源通过 `optional: true` 标记，最终失败后会变成 warning 并跳过
- 瞬时性失败可以按重试策略继续尝试
- `abort()` 会结束当前活动 session，并让挂起中的 preload Promise reject

## 重试、日志、取消与重置

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

可用的日志级别：

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

生命周期相关方法：

- `abort()`：取消当前活动的预加载 session
- `reset()`：将管理器恢复到初始空闲状态
- `resetClearsCache: true`：在 `reset()` 时同时清空成功资源缓存

## API 导出

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
