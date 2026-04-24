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
