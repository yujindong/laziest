# `@laziest/resource-manager`

面向浏览器应用的资源加载库，支持优先级调度和提前进入可展示状态。

`@laziest/resource-manager` 使用静态 `ResourcePlan` 描述资源，通过 `ResourceRuntime` 按优先级执行，并允许关键资源完成后先继续渲染界面，非关键资源在后台继续加载。

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

## 兼容说明

包仍然导出旧版 `ResourceManager` preload API 以保持兼容。新应用建议优先使用 `ResourcePlan`、`ResourceRuntime` 和 `ResourceRun`。
