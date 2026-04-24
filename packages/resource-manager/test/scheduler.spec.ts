import { describe, expect, it } from "vitest";
import {
  buildPrioritySchedulingUnits,
  createResourcePlan,
  normalizePlan,
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
