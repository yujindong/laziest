import { describe, expect, it } from "vitest";
import {
  ResourceRun,
  ResourceRuntime,
  createResourcePlan,
  type ResourceItem,
  type ResourcePlan,
} from "../src";

describe("runtime api", () => {
  it("exports the plan and runtime entrypoints", () => {
    expect(createResourcePlan).toBeTypeOf("function");
    expect(ResourceRuntime).toBeTypeOf("function");
  });

  it("creates a stable plan object", () => {
    const originalItem: ResourceItem = {
      type: "image",
      url: "/hero.png",
    };

    const plan: ResourcePlan = createResourcePlan({
      groups: [{ key: "hero", items: [originalItem] }],
    });

    expect(plan.groups[0]).toMatchObject({
      key: "hero",
      priority: 0,
      blocking: false,
      items: [{ type: "image", url: "/hero.png" }],
    });

    expect(plan.groups[0].items[0]).not.toBe(originalItem);

    originalItem.url = "/mutated.png";

    expect(plan.groups[0].items[0]).toMatchObject({
      type: "image",
      url: "/hero.png",
    });
  });

  it("normalizes raw plans when starting the runtime", () => {
    const rawPlan: ResourcePlan = {
      groups: [{ key: "hero", items: [{ type: "image", url: "/hero.png" }] }],
    };

    const run = new ResourceRuntime(rawPlan).start();

    expect(run.plan.groups[0]).toMatchObject({
      key: "hero",
      priority: 0,
      blocking: false,
      items: [{ type: "image", url: "/hero.png" }],
    });

    expect(run.plan.groups[0].items[0]).not.toBe(rawPlan.groups[0].items[0]);
  });

  it("allows direct ResourceRun construction to expose an idle snapshot", () => {
    const plan = createResourcePlan({
      groups: [{ key: "hero", items: [{ type: "image", url: "/hero.png" }] }],
    });

    const run = new ResourceRun(plan);

    expect(run.getSnapshot()).toMatchObject({
      status: "idle",
      startedAt: null,
      readyAt: null,
      endedAt: null,
      progress: 0,
      groups: [],
      activeItems: [],
      errors: [],
      warnings: [],
    });
  });

  it("lazily starts and returns the singleton run via getRun", async () => {
    let loads = 0;
    const runtime = new ResourceRuntime(
      createResourcePlan({
        groups: [{ key: "hero", items: [{ type: "image", url: "/hero.png" }] }],
      }),
      {
        loaders: {
          image: async () => {
            loads += 1;
          },
        },
      },
    );

    const run = runtime.getRun();

    expect(run).toBeInstanceOf(ResourceRun);
    expect(run).toBe(runtime.start());
    await run.waitForAll();
    expect(loads).toBe(1);
  });

  it("returns the same singleton run across repeated start calls", () => {
    const runtime = new ResourceRuntime(
      createResourcePlan({
        groups: [{ key: "hero", items: [{ type: "image", url: "/hero.png" }] }],
      }),
      {
        loaders: {
          image: async () => undefined,
        },
      },
    );

    const firstRun = runtime.start();
    const secondRun = runtime.start();

    expect(secondRun).toBe(firstRun);
    expect(runtime.getRun()).toBe(firstRun);
  });

  it("isolates nested request config when creating a plan", () => {
    const headers = { "x-trace": "alpha" };

    const plan = createResourcePlan({
      groups: [
        {
          key: "data",
          items: [
            {
              type: "json",
              url: "/data.json",
              requestInit: {
                method: "POST",
                headers,
              },
            },
          ],
        },
      ],
    });

    const plannedItem = plan.groups[0].items[0];
    if (!("requestInit" in plannedItem)) {
      throw new Error("expected data item");
    }
    const requestInit = plannedItem.requestInit;

    expect(requestInit).toMatchObject({
      method: "POST",
      headers: { "x-trace": "alpha" },
    });
    expect(requestInit).not.toBeUndefined();
    expect(requestInit?.headers).not.toBe(headers);

    headers["x-trace"] = "beta";

    expect(plannedItem.requestInit).toMatchObject({
      method: "POST",
      headers: { "x-trace": "alpha" },
    });
  });

  it("resolves waitForReady before non-blocking groups finish", async () => {
    const order: string[] = [];
    let releaseBackground!: () => void;
    const backgroundStarted = new Promise<void>((resolve) => {
      releaseBackground = resolve;
    });

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
            if (item.url === "/gallery.png") {
              await backgroundStarted;
            }
          },
        },
      },
    );

    const run = runtime.start();
    let completed = false;
    const allPromise = run.waitForAll().then(() => {
      completed = true;
    });

    await run.waitForReady();

    expect(run.getSnapshot().status).toBe("ready");
    expect(run.getSnapshot().readyAt).toEqual(expect.any(Number));
    expect(completed).toBe(false);

    releaseBackground();

    await allPromise;
    expect(run.getSnapshot().status).toBe("completed");
    expect(order).toEqual(["/hero.png", "/gallery.png"]);
  });

  it("resolves waitForReady for non-blocking-only plans before work completes", async () => {
    let releaseImage!: () => void;
    const imagePending = new Promise<void>((resolve) => {
      releaseImage = resolve;
    });

    const runtime = new ResourceRuntime(
      createResourcePlan({
        groups: [
          {
            key: "background",
            blocking: false,
            items: [{ type: "image", url: "/gallery.png" }],
          },
        ],
      }),
      {
        loaders: {
          image: async () => {
            await imagePending;
          },
        },
      },
    );

    const run = runtime.start();
    let completed = false;
    const allPromise = run.waitForAll().then(() => {
      completed = true;
    });

    await run.waitForReady();

    expect(run.getSnapshot().status).toBe("ready");
    expect(run.getSnapshot().readyAt).toEqual(expect.any(Number));
    expect(completed).toBe(false);

    releaseImage();

    await allPromise;
    expect(run.getSnapshot().status).toBe("completed");
  });

  it("notifies subscribers with cloned run snapshots", async () => {
    const runtime = new ResourceRuntime(
      createResourcePlan({
        groups: [
          {
            key: "critical",
            blocking: true,
            items: [{ type: "image", url: "/hero.png" }],
          },
        ],
      }),
      {
        loaders: {
          image: async () => undefined,
        },
      },
    );
    const run = runtime.start();
    const snapshots: Array<ReturnType<typeof run.getSnapshot>> = [];

    const unsubscribe = run.subscribe(({ snapshot }) => {
      snapshots.push(snapshot);
      snapshot.groups.length = 0;
    });

    await run.waitForAll();
    unsubscribe();

    expect(snapshots.length).toBeGreaterThan(0);
    expect(run.getSnapshot().groups).toHaveLength(1);
  });
});
