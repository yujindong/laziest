# `@laziest/resource-manager`

面向浏览器应用的资源加载库，支持静态 plan、优先级调度、blocking group 与后台续载。

`@laziest/resource-manager` 使用静态 `ResourcePlan` 描述资源，通过 `ResourceRuntime` 按 group 和 item 优先级执行，等待 blocking group 完成，同时让 non-blocking group 在后台继续加载，并通过快照和订阅暴露运行状态。

## 特性

- 静态 `ResourcePlan` 声明
- group 级和 item 级优先级
- blocking group 用于控制应用 ready
- 非 blocking group 可在 ready 后继续后台加载
- 运行时快照与订阅
- 带失败分类的重试机制
- 单次 run 内去重与可选跨 run 缓存
- 支持取消活动 run
- 可选资源失败后产生 warning，不阻塞 ready

## 安装

```bash
pnpm add @laziest/resource-manager
```

## 浏览器兼容性

- 浏览器运行环境，且支持 `fetch`、`AbortController` 与 `URL`
- 加载字体时需要 `FontFace`
- 加载音视频时需要媒体元素的 preload 能力

如果目标浏览器不具备这些能力，需要在创建 `ResourceRuntime` 之前先加载 polyfill。

```bash
pnpm add whatwg-fetch abortcontroller-polyfill core-js
```

```ts
import 'whatwg-fetch'
import 'abortcontroller-polyfill/dist/abortcontroller-polyfill-only'
import 'core-js/actual/url'
```

说明：

- `whatwg-fetch` 是浏览器侧的 `fetch()` polyfill，应只在客户端加载
- `abortcontroller-polyfill` 用于补齐 `AbortController` 与 `AbortSignal`；只有在环境确实需要时才使用它的 fetch patch 入口
- `core-js/actual/url` 可用于补齐旧浏览器缺失的 `URL`
- 如果你的应用已经通过 Babel、`@core-js/unplugin` 或其他构建步骤自动注入 polyfill，应以那一套为准，避免重复引入

## 快速开始

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

`waitForReady()` 会在所有 blocking group 的必需资源完成后 resolve。此时非 blocking group 可能仍在加载。

`waitForAll()` 会在所有 group 都进入终态后 resolve。

## Plan

plan 是静态声明。每个 group 都是一个调度单元和 ready 判断单元。

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

默认调度顺序是确定的：

- 更高的 `group.priority`
- 更高的 `item.priority`
- 声明顺序

`blocking` 和 `optional` 是两件事：

- `blocking: true` 表示该 group 会影响 runtime ready
- `optional: true` 表示该资源失败后转成 warning，不让 group 失败

`maxConcurrentItems` 用于限制单次 run 中同时活跃的加载数量。优先级只影响排队顺序，不会抢占已经开始的任务。

## Resource Items

每个 item 都有 `type` 和 `url`。

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

支持的类型：

- `image`
- `font`
- `audio`
- `video`
- `lottie`
- `json`
- `text`
- `binary`

## 观察运行状态

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

run 状态：

- `idle`
- `running`
- `ready`
- `completed`
- `failed`
- `aborted`

快照字段包括：

- `status`
- `startedAt`
- `readyAt`
- `endedAt`
- `progress`
- `groups`
- `activeItems`
- `errors`
- `warnings`

## 缓存、重试与取消

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

运行时行为：

- 同一个 run 内重复资源只加载一次
- 传入 cache 后可跨 run 复用结果
- cache key 使用归一化后的、与 loader 配置相关的资源信息
- 瞬时性失败会按重试策略重试
- 取消 run 会把快照状态置为 `aborted`，并 reject 挂起中的 waiter

## 错误处理

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

失败分类包括：

- `http`
- `network`
- `timeout`
- `abort`
- `decode`
- `parse`
- `unsupported`
- `unknown`
