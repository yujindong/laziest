# Priority Resource Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `@laziest/resource-manager` around a static plan, priority-first runtime, and run handle that supports blocking readiness and background completion.

**Architecture:** Replace the current single-session `ResourceManager.preload()`-centric model with a `ResourcePlan` -> `ResourceRuntime` -> `ResourceRun` execution flow. Keep the existing browser loaders, retry helpers, and logger infrastructure where possible, but move scheduling, state, and public API semantics to runtime, group, and item abstractions.

**Tech Stack:** TypeScript, Vitest, tsdown, browser Web APIs

---

## File Structure

Planned file responsibilities before implementation:

- Modify: `packages/resource-manager/src/index.ts`
  Export the new public surface and remove root exposure of the legacy manager API if the rewrite is meant to replace it.
- Modify: `packages/resource-manager/src/shared/types.ts`
  Replace session-oriented public types with plan, runtime, run, group, item, event, cache, and result types.
- Create: `packages/resource-manager/src/core/plan.ts`
  Validate and normalize `ResourcePlan` input into deterministic runtime units.
- Create: `packages/resource-manager/src/core/resource-runtime.ts`
  Hold immutable runtime configuration and expose `start()`.
- Create: `packages/resource-manager/src/core/resource-run.ts`
  Execute one run, maintain snapshots, waiters, subscriptions, abort behavior, and terminal result transitions.
- Create: `packages/resource-manager/src/core/scheduler.ts`
  Build the global priority queue and bounded concurrency scheduler over normalized items.
- Create: `packages/resource-manager/src/core/cache.ts`
  Normalize cache keys and wrap optional cross-run cache behavior.
- Modify: `packages/resource-manager/src/core/errors.ts`
  Adapt error and result types from preload-session semantics to run/group/item semantics.
- Modify: `packages/resource-manager/src/core/retry.ts`
  Reuse current retry helpers with runtime-oriented naming where needed.
- Modify: `packages/resource-manager/src/loaders/index.ts`
  Keep the current loader registry, but adapt any signatures that depend on old normalized item types.
- Modify: `packages/resource-manager/src/loaders/*.ts`
  Adjust loader inputs to the new normalized item type only where necessary.
- Modify: `packages/resource-manager/README.md`
  Rewrite public documentation around plan/runtime/run concepts.
- Modify: `packages/resource-manager/README.zh-CN.md`
  Mirror the new API shape in Chinese docs.
- Modify: `examples/react/src/features/examples/resource-manager/resource-manager-page.tsx`
  Update the example to demonstrate blocking readiness and background completion with the new runtime API.
- Create: `packages/resource-manager/test/runtime-api.spec.ts`
  Cover public exports, idle snapshot shape, and top-level runtime behavior.
- Create: `packages/resource-manager/test/scheduler.spec.ts`
  Cover priority ordering, ready-before-all semantics, and abort behavior.
- Modify: `packages/resource-manager/test/loaders.spec.ts`
  Keep loader coverage aligned with the new normalized item shape.
- Modify: `packages/resource-manager/test/retry-and-errors.spec.ts`
  Assert runtime-level and group-level failure semantics.

### Task 1: Replace The Public Type Surface

**Files:**
- Modify: `packages/resource-manager/src/shared/types.ts`
- Modify: `packages/resource-manager/src/index.ts`
- Test: `packages/resource-manager/test/runtime-api.spec.ts`

- [ ] **Step 1: Write the failing API test**

```ts
import { describe, expect, it } from "vitest";
import {
  ResourceRuntime,
  createResourcePlan,
  type ResourcePlan,
} from "../src";

describe("runtime api", () => {
  it("exports the plan and runtime entrypoints", () => {
    expect(createResourcePlan).toBeTypeOf("function");
    expect(ResourceRuntime).toBeTypeOf("function");
  });

  it("creates a stable plan object", () => {
    const plan: ResourcePlan = createResourcePlan({
      groups: [{ key: "hero", blocking: true, items: [] }],
    });

    expect(plan.groups[0]).toMatchObject({
      key: "hero",
      blocking: true,
      items: [],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @laziest/resource-manager test -- runtime-api.spec.ts`
Expected: FAIL with missing exports such as `createResourcePlan` and `ResourceRuntime`

- [ ] **Step 3: Define the new public types and exports**

```ts
export interface ResourceGroup {
  key: string;
  priority?: number;
  blocking?: boolean;
  items: ResourceItem[];
}

export interface ResourcePlan {
  groups: ResourceGroup[];
}

export function createResourcePlan(plan: ResourcePlan): ResourcePlan {
  return {
    groups: plan.groups.map((group) => ({
      key: group.key,
      priority: group.priority ?? 0,
      blocking: group.blocking ?? false,
      items: [...group.items],
    })),
  };
}

export { ResourceRuntime } from "./core/resource-runtime";
export type * from "./shared/types";
```

- [ ] **Step 4: Add a minimal runtime skeleton**

```ts
export class ResourceRuntime {
  constructor(
    readonly plan: ResourcePlan,
    readonly options: ResourceRuntimeOptions = {},
  ) {}

  start(): ResourceRun {
    return new ResourceRun(this.plan, this.options);
  }
}
```

- [ ] **Step 5: Run the focused test to verify it passes**

Run: `pnpm --filter @laziest/resource-manager test -- runtime-api.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/resource-manager/src/shared/types.ts packages/resource-manager/src/index.ts packages/resource-manager/src/core/resource-runtime.ts packages/resource-manager/test/runtime-api.spec.ts
git commit -m "feat: introduce resource runtime api surface"
```

### Task 2: Normalize Plans And Build Priority Scheduling Units

**Files:**
- Create: `packages/resource-manager/src/core/plan.ts`
- Create: `packages/resource-manager/src/core/scheduler.ts`
- Modify: `packages/resource-manager/src/shared/types.ts`
- Test: `packages/resource-manager/test/scheduler.spec.ts`

- [ ] **Step 1: Write the failing scheduling test**

```ts
import { describe, expect, it } from "vitest";
import { createResourcePlan } from "../src";
import { normalizePlan, sortScheduledItems } from "../src/core/plan";

describe("plan scheduling", () => {
  it("sorts by group priority, item priority, then declaration order", () => {
    const plan = createResourcePlan({
      groups: [
        {
          key: "background",
          priority: 10,
          items: [{ type: "image", url: "/bg.png", priority: 1 }],
        },
        {
          key: "hero",
          priority: 100,
          items: [
            { type: "image", url: "/hero-b.png", priority: 10 },
            { type: "image", url: "/hero-a.png", priority: 50 },
          ],
        },
      ],
    });

    const items = sortScheduledItems(normalizePlan(plan));

    expect(items.map((item) => item.url)).toEqual([
      "/hero-a.png",
      "/hero-b.png",
      "/bg.png",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @laziest/resource-manager test -- scheduler.spec.ts`
Expected: FAIL with missing `normalizePlan` or incorrect ordering

- [ ] **Step 3: Implement plan normalization**

```ts
export interface NormalizedGroup {
  key: string;
  priority: number;
  blocking: boolean;
  index: number;
  items: NormalizedItem[];
}

export interface NormalizedItem {
  key: string;
  groupKey: string;
  url: string;
  type: ResourceType;
  optional: boolean;
  priority: number;
  groupPriority: number;
  index: number;
  groupIndex: number;
  dedupeKey: string;
}

export function normalizePlan(plan: ResourcePlan): NormalizedGroup[] {
  return plan.groups.map((group, groupIndex) => ({
    key: group.key,
    priority: group.priority ?? 0,
    blocking: group.blocking ?? false,
    index: groupIndex,
    items: group.items.map((item, itemIndex) => ({
      key: item.key ?? `${group.key}:${itemIndex}`,
      groupKey: group.key,
      url: item.url,
      type: item.type,
      optional: item.optional ?? false,
      priority: item.priority ?? 0,
      groupPriority: group.priority ?? 0,
      index: itemIndex,
      groupIndex,
      dedupeKey: `${item.type}:${item.url}`,
    })),
  }));
}
```

- [ ] **Step 4: Implement stable sorting helpers**

```ts
export function sortScheduledItems(groups: NormalizedGroup[]): NormalizedItem[] {
  return groups
    .flatMap((group) => group.items)
    .sort((left, right) => {
      if (right.groupPriority !== left.groupPriority) {
        return right.groupPriority - left.groupPriority;
      }

      if (right.priority !== left.priority) {
        return right.priority - left.priority;
      }

      if (left.groupIndex !== right.groupIndex) {
        return left.groupIndex - right.groupIndex;
      }

      return left.index - right.index;
    });
}
```

- [ ] **Step 5: Run the focused test to verify it passes**

Run: `pnpm --filter @laziest/resource-manager test -- scheduler.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/resource-manager/src/core/plan.ts packages/resource-manager/src/core/scheduler.ts packages/resource-manager/src/shared/types.ts packages/resource-manager/test/scheduler.spec.ts
git commit -m "feat: add normalized plan and priority scheduling"
```

### Task 3: Implement ResourceRun State, Ready Semantics, And Waiters

**Files:**
- Create: `packages/resource-manager/src/core/resource-run.ts`
- Modify: `packages/resource-manager/src/core/resource-runtime.ts`
- Modify: `packages/resource-manager/src/core/errors.ts`
- Modify: `packages/resource-manager/src/shared/types.ts`
- Test: `packages/resource-manager/test/runtime-api.spec.ts`
- Test: `packages/resource-manager/test/retry-and-errors.spec.ts`

- [ ] **Step 1: Write the failing ready-state test**

```ts
import { describe, expect, it } from "vitest";
import { ResourceRuntime, createResourcePlan } from "../src";

describe("run readiness", () => {
  it("resolves waitForReady before non-blocking groups finish", async () => {
    const order: string[] = [];
    const runtime = new ResourceRuntime(
      createResourcePlan({
        groups: [
          {
            key: "critical",
            blocking: true,
            priority: 100,
            items: [{ type: "image", url: "/hero.png" }],
          },
          {
            key: "background",
            blocking: false,
            priority: 1,
            items: [{ type: "image", url: "/gallery.png" }],
          },
        ],
      }),
      {
        loaders: {
          image: async (item) => {
            order.push(item.url);
          },
        },
      },
    );

    const run = runtime.start();
    await run.waitForReady();

    expect(run.getSnapshot().status).toBe("ready");

    await run.waitForAll();
    expect(order).toEqual(["/hero.png", "/gallery.png"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @laziest/resource-manager test -- runtime-api.spec.ts retry-and-errors.spec.ts`
Expected: FAIL because `waitForReady()` and run state transitions are not implemented

- [ ] **Step 3: Implement the run snapshot and waiters**

```ts
function createIdleRunSnapshot(): ResourceRunSnapshot {
  return {
    status: "idle",
    startedAt: null,
    endedAt: null,
    progress: 0,
    groups: [],
    activeItems: [],
    errors: [],
    warnings: [],
  };
}

export class ResourceRun {
  private snapshot = createIdleRunSnapshot();
  private readonly readyDeferred = Promise.withResolvers<ResourceReadyResult>();
  private readonly completeDeferred = Promise.withResolvers<ResourceCompleteResult>();

  getSnapshot(): ResourceRunSnapshot {
    return cloneRunSnapshot(this.snapshot);
  }

  waitForReady(): Promise<ResourceReadyResult> {
    return this.readyDeferred.promise;
  }

  waitForAll(): Promise<ResourceCompleteResult> {
    return this.completeDeferred.promise;
  }
}
```

- [ ] **Step 4: Implement readiness and terminal transitions**

```ts
private updateRunStatus(): void {
  const blockingGroups = this.snapshot.groups.filter((group) => group.blocking);
  const allBlockingReady = blockingGroups.every((group) => group.status === "ready" || group.status === "completed");
  const anyBlockingFailed = blockingGroups.some((group) => group.status === "failed");
  const allGroupsTerminal = this.snapshot.groups.every((group) =>
    ["completed", "failed", "skipped"].includes(group.status),
  );

  if (anyBlockingFailed) {
    this.snapshot = { ...this.snapshot, status: "failed", endedAt: Date.now() };
    this.readyDeferred.reject(new ResourceRunError("Blocking groups failed"));
    this.completeDeferred.reject(new ResourceRunError("Blocking groups failed"));
    return;
  }

  if (allBlockingReady && this.snapshot.status === "running") {
    this.snapshot = { ...this.snapshot, status: "ready" };
    this.readyDeferred.resolve(createReadyResult(this.snapshot));
  }

  if (allGroupsTerminal) {
    this.snapshot = { ...this.snapshot, status: "completed", endedAt: Date.now() };
    this.completeDeferred.resolve(createCompleteResult(this.snapshot));
  }
}
```

- [ ] **Step 5: Run the focused tests to verify they pass**

Run: `pnpm --filter @laziest/resource-manager test -- runtime-api.spec.ts retry-and-errors.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/resource-manager/src/core/resource-run.ts packages/resource-manager/src/core/resource-runtime.ts packages/resource-manager/src/core/errors.ts packages/resource-manager/src/shared/types.ts packages/resource-manager/test/runtime-api.spec.ts packages/resource-manager/test/retry-and-errors.spec.ts
git commit -m "feat: add resource run readiness lifecycle"
```

### Task 4: Wire The Scheduler To Loaders, Retry, Cache, And Abort

**Files:**
- Modify: `packages/resource-manager/src/core/resource-run.ts`
- Modify: `packages/resource-manager/src/core/scheduler.ts`
- Create: `packages/resource-manager/src/core/cache.ts`
- Modify: `packages/resource-manager/src/core/retry.ts`
- Modify: `packages/resource-manager/src/loaders/index.ts`
- Modify: `packages/resource-manager/test/loaders.spec.ts`
- Modify: `packages/resource-manager/test/scheduler.spec.ts`

- [ ] **Step 1: Write the failing integration test**

```ts
import { describe, expect, it, vi } from "vitest";
import { ResourceRuntime, createResourcePlan } from "../src";

describe("runtime execution", () => {
  it("dedupes repeated resources and reuses cache across runs", async () => {
    const loader = vi.fn(async () => ({ ok: true }));
    const cache = new Map<string, unknown>();

    const plan = createResourcePlan({
      groups: [
        {
          key: "critical",
          blocking: true,
          priority: 100,
          items: [
            { type: "json", url: "/bootstrap.json" },
            { type: "json", url: "/bootstrap.json" },
          ],
        },
      ],
    });

    const runtime = new ResourceRuntime(plan, {
      cache: {
        get: (key) => cache.get(key),
        set: (key, value) => void cache.set(key, value),
      },
      loaders: { json: loader },
    });

    await runtime.start().waitForAll();
    await runtime.start().waitForAll();

    expect(loader).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @laziest/resource-manager test -- scheduler.spec.ts loaders.spec.ts`
Expected: FAIL because dedupe, cache, or retry integration is incomplete

- [ ] **Step 3: Implement cache helpers and in-run dedupe**

```ts
export function createCacheKey(item: NormalizedItem): string {
  return `${item.type}:${item.url}`;
}

export async function resolveCachedValue(
  cache: ResourceCache | undefined,
  item: NormalizedItem,
): Promise<unknown | undefined> {
  if (!cache) {
    return undefined;
  }

  return await cache.get(createCacheKey(item));
}
```

- [ ] **Step 4: Integrate the execution loop with retry and abort**

```ts
for (const item of dequeueNextItems()) {
  const controller = new AbortController();
  this.trackActiveItem(item, controller);

  queueTask(async () => {
    const cached = await resolveCachedValue(this.options.cache, item);
    if (cached !== undefined) {
      this.markItemSucceeded(item, { fromCache: true });
      return;
    }

    await runWithRetry(async () => {
      const value = await this.loaders[item.type](item, {
        signal: controller.signal,
        onProgress: (transfer) => this.markItemProgress(item, transfer),
      });
      await writeCacheValue(this.options.cache, item, value);
      this.markItemSucceeded(item, { fromCache: false });
    });
  });
}
```

- [ ] **Step 5: Run the focused tests to verify they pass**

Run: `pnpm --filter @laziest/resource-manager test -- scheduler.spec.ts loaders.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/resource-manager/src/core/resource-run.ts packages/resource-manager/src/core/scheduler.ts packages/resource-manager/src/core/cache.ts packages/resource-manager/src/core/retry.ts packages/resource-manager/src/loaders/index.ts packages/resource-manager/test/loaders.spec.ts packages/resource-manager/test/scheduler.spec.ts
git commit -m "feat: connect scheduler to loaders retry and cache"
```

### Task 5: Rewrite Public Documentation And Demo Usage

**Files:**
- Modify: `packages/resource-manager/README.md`
- Modify: `packages/resource-manager/README.zh-CN.md`
- Modify: `examples/react/src/features/examples/resource-manager/resource-manager-page.tsx`
- Test: `packages/resource-manager/test/runtime-api.spec.ts`

- [ ] **Step 1: Write the failing example-oriented test**

```ts
import { describe, expect, it } from "vitest";
import { ResourceRuntime, createResourcePlan } from "../src";

describe("docs api shape", () => {
  it("supports the readme example flow", async () => {
    const runtime = new ResourceRuntime(
      createResourcePlan({
        groups: [{ key: "hero", blocking: true, items: [] }],
      }),
    );

    expect(runtime.start).toBeTypeOf("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails if the public API drifted**

Run: `pnpm --filter @laziest/resource-manager test -- runtime-api.spec.ts`
Expected: PASS once the public API is stable; if it fails, fix the API before rewriting docs

- [ ] **Step 3: Rewrite the README around plan/runtime/run**

```md
## Quick Start

```ts
const plan = createResourcePlan({
  groups: [
    {
      key: "bootstrap",
      priority: 100,
      blocking: true,
      items: [{ type: "json", url: "/api/bootstrap.json" }],
    },
    {
      key: "background",
      priority: 10,
      blocking: false,
      items: [{ type: "image", url: "/images/gallery-1.webp" }],
    },
  ],
});

const runtime = new ResourceRuntime(plan, { maxConcurrentItems: 4 });
const run = runtime.start();

await run.waitForReady();
await run.waitForAll();
```
```

- [ ] **Step 4: Update the example page to show ready vs all-complete**

```tsx
const runtime = new ResourceRuntime(plan, { maxConcurrentItems: 3 });

useEffect(() => {
  const run = runtime.start();
  const unsubscribe = run.subscribe(({ snapshot }) => {
    setProgress(snapshot.progress);
    setStatus(snapshot.status);
  });

  void run.waitForReady().then(() => setReady(true));
  void run.waitForAll();

  return unsubscribe;
}, []);
```

- [ ] **Step 5: Run package tests and the example build**

Run: `pnpm --filter @laziest/resource-manager test`
Expected: PASS

Run: `pnpm --filter @laziest/resource-manager typecheck`
Expected: PASS

Run: `pnpm --filter examples-react build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/resource-manager/README.md packages/resource-manager/README.zh-CN.md examples/react/src/features/examples/resource-manager/resource-manager-page.tsx packages/resource-manager/test/runtime-api.spec.ts
git commit -m "docs: update runtime usage documentation and demo"
```

## Self-Review

Spec coverage check:

- Public runtime model: covered by Tasks 1 and 3
- Group-level and item-level priority semantics: covered by Task 2
- Ready-state semantics: covered by Task 3
- Snapshot and event model: covered by Tasks 3 and 4
- Runtime failure and completion behavior: covered by Tasks 3 and 4
- Extensibility for loaders, retry, logging, and cache: covered by Task 4
- Public docs and example usage: covered by Task 5

Placeholder scan:

- No `TODO`, `TBD`, or deferred references remain
- Each task lists exact files, commands, and code targets

Type consistency check:

- The plan consistently uses `ResourcePlan`, `ResourceRuntime`, `ResourceRun`, `NormalizedGroup`, and `NormalizedItem`
- `waitForReady()` and `waitForAll()` are introduced before later tasks depend on them
