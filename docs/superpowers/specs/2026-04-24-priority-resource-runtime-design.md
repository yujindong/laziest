# Priority Resource Runtime Design

**Date:** 2026-04-24

## Goal

Design a browser-oriented, open-source resource loading library from scratch that supports:

- Priority-first scheduling across resource groups and individual resources
- Early application readiness once blocking resources are complete
- Continued background loading for non-blocking resources
- Observable runtime, group, and item state for UI and logging

The design should optimize for clear public concepts, predictable behavior, and long-term maintainability in an open-source package.

## Scope

This design covers:

- The public runtime model for declaring and executing resource loading plans
- Group-level and item-level priority semantics
- Ready-state semantics for blocking and non-blocking groups
- Snapshot and event models for observing progress
- Runtime failure and completion behavior
- Extensibility points for loaders, retry, logging, and cache

This design does not cover:

- Backward compatibility with the existing `ResourceManager` package API
- Runtime mutation such as appending groups or items after start
- Custom ready conditions such as partial group thresholds
- Preemptive cancellation or task stealing once a resource load has started
- Non-browser runtimes

## Constraints

- The library is intended for public open-source use, so API concepts must be easy to explain and hard to misuse
- Priority must be a first-class scheduling concept
- Ready-state semantics must be explicit and separate from optional-failure semantics
- A static load plan is preferred over dynamic runtime mutation in v1
- Default behavior should be deterministic and observable

## Approaches

### Option A: Single manager with one manifest preload call

Expose one `preload(manifest)` entrypoint that internally handles grouping, priority, readiness, and completion.

Pros:

- Minimal surface area
- Familiar to users coming from simpler preload libraries

Cons:

- Conflates declaration, scheduling, and execution into one abstraction
- Hard to model `ready` separately from `completed`
- Tends to accumulate overloaded flags and implicit behavior as requirements grow

### Option B: Manager plus orchestration groups

Keep a manager abstraction for item loading and add a higher-level orchestration API for grouping and readiness.

Pros:

- Better separation than a single manager
- Can evolve from existing preload-oriented designs

Cons:

- Still risks blurred ownership between manager and orchestrator
- Easy to end up with duplicated state models
- Group behavior often becomes an add-on instead of a first-class concept

### Option C: Static plan plus runtime execution model

Declare a static `ResourcePlan`, execute it with a `ResourceRuntime`, and interact with the running execution through a `ResourceRun` handle.

Pros:

- Separates declaration from execution
- Makes `ready` and `completed` distinct, explicit states
- Naturally supports priority scheduling, snapshots, and subscriptions
- Leaves room for future cache and loader extensibility without redesigning the core API

Cons:

- Slightly larger initial API surface than a single preload function
- Requires users to learn a small set of core concepts

## Recommendation

Use Option C.

The public model should distinguish:

- `ResourcePlan`: what should be loaded
- `ResourceRuntime`: how the plan is executed
- `ResourceRun`: the live handle for one execution

This is the cleanest structure for an open-source library that must support priority, readiness, background continuation, and observability without overloading a single class.

## Design

### Core Concepts

#### ResourceItem

A `ResourceItem` describes one concrete asset to load. It includes its resource type, URL, loader-specific metadata, and optional item-level priority.

Item-level `optional` only controls whether final failure of that item escalates into a group or runtime failure.

#### ResourceGroup

A `ResourceGroup` is the primary business-facing scheduling unit. It groups related items such as `bootstrap`, `hero`, or `background`.

Each group has:

- a stable `key`
- a group-level `priority`
- a `blocking` flag that determines whether the group must complete before the runtime becomes ready
- a static list of `items`

The group concept exists to reflect how applications think about resource readiness, not just how resources are transported.

#### ResourcePlan

A `ResourcePlan` is a static declaration object containing all groups and items for a run. It is immutable after runtime start in v1.

#### ResourceRuntime

A `ResourceRuntime` owns execution behavior such as queueing, concurrency, retry policy, cache usage, loaders, and logging. It is constructed from a `ResourcePlan` and runtime options.

#### ResourceRun

A `ResourceRun` is returned by `runtime.start()`. It exposes:

- snapshots
- subscriptions
- wait helpers such as `waitForReady()` and `waitForAll()`
- abort capability

This separates one configured runtime from one specific run.

### Public API

The public TypeScript surface should look roughly like this:

```ts
type ResourceType =
  | "image"
  | "font"
  | "audio"
  | "video"
  | "lottie"
  | "json"
  | "text"
  | "binary";

interface BaseResourceItem {
  key?: string;
  type: ResourceType;
  url: string;
  optional?: boolean;
  priority?: number;
}

interface FontResourceItem extends BaseResourceItem {
  type: "font";
  family: string;
  descriptors?: FontFaceDescriptors;
}

interface MediaResourceItem extends BaseResourceItem {
  type: "audio" | "video";
  preload?: "auto" | "metadata" | "none";
  crossOrigin?: "" | "anonymous" | "use-credentials";
}

interface DataResourceItem extends BaseResourceItem {
  type: "json" | "text" | "binary" | "lottie";
  requestInit?: RequestInit;
}

type ResourceItem =
  | BaseResourceItem
  | FontResourceItem
  | MediaResourceItem
  | DataResourceItem;

interface ResourceGroup {
  key: string;
  priority?: number;
  blocking?: boolean;
  items: ResourceItem[];
}

interface ResourcePlan {
  groups: ResourceGroup[];
}

interface ResourceRuntimeOptions {
  maxConcurrentItems?: number;
  retry?: RetryOptions;
  cache?: ResourceCache;
  loaders?: Partial<ResourceLoaderRegistry>;
  logger?: ResourceLogger;
  logLevel?: LogLevel;
}

declare function createResourcePlan(plan: ResourcePlan): ResourcePlan;

declare class ResourceRuntime {
  constructor(plan: ResourcePlan, options?: ResourceRuntimeOptions);
  start(): ResourceRun;
}

declare class ResourceRun {
  getSnapshot(): ResourceRunSnapshot;
  subscribe(listener: ResourceRunSubscriber): () => void;
  waitForReady(): Promise<ResourceReadyResult>;
  waitForGroup(groupKey: string): Promise<ResourceGroupResult>;
  waitForAll(): Promise<ResourceCompleteResult>;
  abort(): void;
}
```

### Scheduling Model

The runtime scheduler should use a global priority queue with bounded concurrency.

Default scheduling order:

1. Higher `group.priority` first
2. Higher `item.priority` first
3. Declaration order as a stable tiebreaker

Key properties:

- Priority is advisory for items that have not started yet
- Started resource loads are not preempted
- Priority affects scheduling order, not failure semantics
- Groups do not need explicit dependency graphs in v1

This model keeps priority powerful enough for real applications while remaining predictable and straightforward to document.

### Ready And Completion Semantics

The runtime must distinguish between `ready` and `completed`.

#### Runtime Ready

The runtime becomes `ready` when every `blocking: true` group has successfully completed all of its required items.

This means:

- `blocking` controls application readiness
- `optional` controls failure escalation of individual items
- Non-blocking groups may continue loading after the runtime is ready

#### Group Completion

A group is considered completed when all items in that group have reached a terminal state:

- `succeeded`
- `failed`
- `skipped`

For a blocking group to satisfy readiness, all non-optional items must succeed.

#### All Completion

The runtime becomes `completed` when every group has reached a terminal state and no runtime-level blocking failure has occurred.

### Failure Semantics

Failure should be modeled at three levels.

#### Item Failure

An item can fail due to network, HTTP, timeout, decode, parse, unsupported, abort, or unknown reasons.

If the item is optional, the failure is retained as a warning or non-escalating error and the item enters a terminal skipped or failed state depending on loader policy.

If the item is required, the failure contributes to group failure.

#### Group Failure

A group fails when one or more required items in that group reach final failure.

For blocking groups, this prevents runtime readiness.

For non-blocking groups, this does not block readiness but should still be observable in snapshots and events.

#### Runtime Failure

The runtime fails when readiness becomes impossible because at least one blocking group has failed.

This should reject `waitForReady()` and surface a terminal runtime snapshot with the relevant errors attached.

### Status Model

The library should expose runtime, group, and item status separately.

```ts
interface ResourceRunSnapshot {
  status: "idle" | "running" | "ready" | "completed" | "failed" | "aborted";
  startedAt: number | null;
  endedAt: number | null;
  progress: number;
  groups: ResourceGroupSnapshot[];
  activeItems: ResourceItemSnapshot[];
  errors: ResourceFailure[];
  warnings: ResourceWarning[];
}

interface ResourceGroupSnapshot {
  key: string;
  status: "queued" | "running" | "ready" | "completed" | "failed" | "skipped";
  blocking: boolean;
  priority: number;
  total: number;
  queued: number;
  loading: number;
  completed: number;
  progress: number;
}

interface ResourceItemSnapshot {
  key: string;
  url: string;
  type: ResourceType;
  status: "queued" | "loading" | "succeeded" | "failed" | "skipped";
  priority: number;
  fromCache: boolean;
  error?: ResourceFailure;
}
```

`ready` exists only because it conveys useful runtime and group-level meaning to applications. It should not be inferred indirectly from raw item counters in userland.

### Event Model

The runtime should provide subscriptions that carry both the latest snapshot and a typed event.

Recommended event set:

- `run-started`
- `run-ready`
- `run-completed`
- `run-failed`
- `run-aborted`
- `group-started`
- `group-ready`
- `group-completed`
- `group-failed`
- `item-started`
- `item-progress`
- `item-succeeded`
- `item-failed`
- `warning`

The event model exists for observability and UI reactions. It should not be the only way to access state; snapshots remain the primary source of truth.

### Cache And Deduplication

The design should distinguish between:

- in-run deduplication
- cross-run cache reuse

#### In-Run Deduplication

If the same normalized resource appears multiple times in a single plan, it should load once and fan out the result to all referencing items.

#### Cross-Run Cache

Cross-run reuse should be provided through an explicit cache interface passed into runtime options:

```ts
interface ResourceCache {
  get(key: string): unknown | Promise<unknown> | undefined;
  set(key: string, value: unknown): void | Promise<void>;
  has?(key: string): boolean | Promise<boolean>;
  delete?(key: string): void | Promise<void>;
}
```

This keeps cache policy extensible and avoids hard-coding hidden global caches into the runtime core.

### Retry, Logging, And Loaders

The library should support:

- configurable retry policy for transient failures
- pluggable loaders by resource type
- configurable logger and log level

These remain runtime options rather than plan metadata because they describe execution policy, not business intent.

### Example Usage

The README-level example should look roughly like this:

```ts
const plan = createResourcePlan({
  groups: [
    {
      key: "bootstrap",
      priority: 100,
      blocking: true,
      items: [
        { type: "json", url: "/api/bootstrap.json" },
        { type: "font", url: "/fonts/brand.woff2", family: "Brand Sans" },
      ],
    },
    {
      key: "hero",
      priority: 90,
      blocking: true,
      items: [
        { type: "image", url: "/images/hero.webp", priority: 100 },
        { type: "video", url: "/video/hero.mp4", priority: 10, optional: true },
      ],
    },
    {
      key: "background",
      priority: 10,
      blocking: false,
      items: [
        { type: "image", url: "/images/gallery-1.webp" },
        { type: "image", url: "/images/gallery-2.webp" },
      ],
    },
  ],
});

const runtime = new ResourceRuntime(plan, {
  maxConcurrentItems: 6,
  logLevel: "info",
});

const run = runtime.start();

run.subscribe(({ snapshot, event }) => {
  console.log(snapshot.status, event.type);
});

await run.waitForReady();
renderApp();

await run.waitForAll();
```

## V1 Non-Goals

The first public version should explicitly not support:

- runtime mutation after `start()`
- partial group readiness such as "3 of 5 assets"
- preemptive interruption of already running loads
- arbitrary dependency graphs between groups
- server-side rendering or non-browser resource execution

These are reasonable future extensions, but excluding them keeps the initial public model small and reliable.

## Testing

The implementation should be validated with tests covering:

- scheduling order across group and item priorities
- `waitForReady()` resolving before background groups complete
- `waitForReady()` rejecting when a blocking group fails
- `waitForAll()` including non-blocking groups
- in-run deduplication
- retry behavior for transient failures
- cache reuse across runs when a cache is provided
- event ordering for run, group, and item transitions
- abort behavior during active loads

## Recommendation Summary

Build the library around a static `ResourcePlan`, a configurable `ResourceRuntime`, and a live `ResourceRun` handle.

Treat `group` as a first-class concept, use priority-first scheduling without preemption, keep readiness separate from item optionality, and make snapshots and events explicit at runtime, group, and item levels.
