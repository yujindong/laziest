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
