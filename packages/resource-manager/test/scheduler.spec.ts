import { describe, expect, it, vi } from "vitest";
import {
  buildPrioritySchedulingUnits,
  createResourcePlan,
  normalizePlan,
  ResourceRuntime,
  sortScheduledItems,
} from "../src";

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

  it("breaks equal-priority ties by declaration order", () => {
    const plan = createResourcePlan({
      groups: [
        {
          key: "hero",
          priority: 100,
          items: [
            { type: "image", url: "/hero-a.png", priority: 50 },
            { type: "image", url: "/hero-b.png", priority: 50 },
          ],
        },
        {
          key: "supporting",
          priority: 100,
          items: [{ type: "image", url: "/supporting.png", priority: 50 }],
        },
      ],
    });

    const items = sortScheduledItems(normalizePlan(plan));

    expect(items.map((item) => item.url)).toEqual([
      "/hero-a.png",
      "/hero-b.png",
      "/supporting.png",
    ]);
  });

  it("preserves loader-relevant item config when normalizing", () => {
    const plan = createResourcePlan({
      groups: [
        {
          key: "assets",
          items: [
            {
              type: "font",
              url: "/brand.woff2",
              family: "Brand",
              descriptors: { weight: "700" },
            },
            {
              type: "video",
              url: "/intro.mp4",
              preload: "metadata",
              crossOrigin: "anonymous",
            },
            {
              type: "json",
              url: "/data.json",
              requestInit: { method: "POST", headers: { "x-mode": "full" } },
            },
          ],
        },
      ],
    });

    const [fontItem, videoItem, dataItem] = normalizePlan(plan)[0].items;

    expect(fontItem).toMatchObject({
      family: "Brand",
      descriptors: { weight: "700" },
    });
    expect(videoItem).toMatchObject({
      preload: "metadata",
      crossOrigin: "anonymous",
    });
    expect(dataItem).toMatchObject({
      requestInit: { method: "POST", headers: { "x-mode": "full" } },
    });
  });

  it("keeps distinct dedupe keys when loader config differs", () => {
    const plan = createResourcePlan({
      groups: [
        {
          key: "data",
          items: [
            {
              type: "json",
              url: "/data.json",
              requestInit: { method: "GET" },
            },
            {
              type: "json",
              url: "/data.json",
              requestInit: { method: "POST" },
            },
          ],
        },
      ],
    });

    const [firstItem, secondItem] = normalizePlan(plan)[0].items;

    expect(firstItem.dedupeKey).not.toBe(secondItem.dedupeKey);
  });

  it("propagates the group blocking flag into scheduling units", () => {
    const plan = createResourcePlan({
      groups: [
        {
          key: "blocking",
          blocking: true,
          priority: 100,
          items: [{ type: "image", url: "/hero.png" }],
        },
        {
          key: "background",
          blocking: false,
          priority: 10,
          items: [{ type: "image", url: "/bg.png" }],
        },
      ],
    });

    const units = buildPrioritySchedulingUnits(normalizePlan(plan));

    expect(units).toHaveLength(2);
    expect(units[0]).toMatchObject({
      blocking: true,
      item: { url: "/hero.png", groupKey: "blocking" },
    });
    expect(units[1]).toMatchObject({
      blocking: false,
      item: { url: "/bg.png", groupKey: "background" },
    });
  });
});

describe("runtime execution", () => {
  it("never exceeds the configured runtime concurrency window", async () => {
    let active = 0;
    let maxActive = 0;
    const releases: Array<() => void> = [];
    const loader = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          releases.push(() => {
            active -= 1;
            resolve();
          });
        }),
    );

    const runtime = new ResourceRuntime(
      createResourcePlan({
        groups: [
          {
            key: "critical",
            blocking: true,
            items: [
              { type: "json", url: "/a.json" },
              { type: "json", url: "/b.json" },
              { type: "json", url: "/c.json" },
            ],
          },
        ],
      }),
      {
        maxConcurrentItems: 2,
        loaders: { json: loader },
      },
    );

    const allPromise = runtime.start().waitForAll();

    await vi.waitFor(() => {
      expect(loader).toHaveBeenCalledTimes(2);
    });
    expect(maxActive).toBe(2);

    releases.shift()?.();
    await vi.waitFor(() => {
      expect(loader).toHaveBeenCalledTimes(3);
    });
    expect(maxActive).toBe(2);

    releases.forEach((release) => release());
    await allPromise;
  });

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

  it("does not reuse cache entries when loader-relevant config differs", async () => {
    const loader = vi.fn(async () => ({ ok: true }));
    const cache = new Map<string, unknown>();

    const runtime = new ResourceRuntime(
      createResourcePlan({
        groups: [
          {
            key: "data",
            blocking: true,
            items: [
              {
                type: "json",
                url: "/bootstrap.json",
                requestInit: { method: "GET" },
              },
              {
                type: "json",
                url: "/bootstrap.json",
                requestInit: { method: "POST" },
              },
            ],
          },
        ],
      }),
      {
        cache: {
          get: (key) => cache.get(key),
          set: (key, value) => void cache.set(key, value),
        },
        loaders: { json: loader },
      },
    );

    await runtime.start().waitForAll();

    expect(loader).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(2);
  });
});
