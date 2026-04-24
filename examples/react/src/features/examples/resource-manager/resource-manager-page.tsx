import {
  ResourceRun,
  ResourceRuntime,
  createResourcePlan,
  type ResourceRunSnapshot,
} from "@laziest/resource-manager";
import { useEffect, useState } from "react";

const img1List = [
  // "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game01/11title.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game01/cover.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game01/answer_wrong.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game01/answer_right.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game01/question_1/question.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game01/question_2/question.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game01/question_3/question.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game01/question_4/question.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game01/question_5/question.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game01/question_1/answer_1.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game01/question_2/answer_1.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game01/question_3/answer_1.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game01/question_4/answer_1.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game01/question_5/answer_1.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game01/question_1/answer_2.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game01/question_2/answer_2.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game01/question_3/answer_2.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game01/question_4/answer_2.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game01/question_5/answer_2.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game01/question_1/answer_3.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game01/question_2/answer_3.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game01/question_3/answer_3.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game01/question_4/answer_3.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game01/question_5/answer_3.png",
];
const img2List = [
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game02/title.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game02/magnifier.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game02/card/card_bg_1.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game02/card/card_bg_2.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game02/card/card_bg_3.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game02/card/card_bg_4.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game02/card/card_bg_5.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game02/card/card_bg_6.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game02/card/card_bg_7.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game02/card/card_bg_8.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game02/card/card_bg_9.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game02/card/card_1.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game02/card/card_2.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game02/card/card_3.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game02/card/card_4.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game02/card/card_logo.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game02/scan-title.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game02/scan-tips.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game02/scan-tips-dialog.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game02/scan-close.png",
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game02/scan-bottom-img.png",
];

const plan = createResourcePlan({
  groups: [
    {
      key: "critical",
      priority: 100,
      blocking: true,
      items: [
        ...img1List.map((url) => ({
          type: "image" as const,
          url,
          optional: true,
          priority: 100,
        })),
        {
          type: "font" as const,
          url: "https://pintu-image.go.sohu.com/activities/fonts/FZLTDHK.TTF",
          family: "方正兰亭大黑",
          optional: false,
          priority: 10,
        },
      ],
    },
    {
      key: "background",
      priority: 10,
      blocking: false,
      items: [
        ...[...img1List.slice(2), ...img2List].map((url) => ({
          type: "image" as const,
          url,
          optional: true,
        })),
        ...[
          // "https://pintu-image.go.sohu.com/lingchuang/home/v2/feature01/bg-12604081100.mp4",
          "https://pintu-image.go.sohu.com/lingchuang/home/v2/feature01/loop-2604081100.mp4",
        ].map((url) => ({
          type: "video" as const,
          url,
          optional: true,
        })),
      ],
    },
  ],
});

const runtime = new ResourceRuntime(plan, {
  maxConcurrentItems: 1,
  logLevel: "debug",
  retry: { maxRetries: 1, delayMs: 200, backoff: "fixed" },
});

const ResourceManagerPage = () => {
  const [snapshot, setSnapshot] = useState<ResourceRunSnapshot>(() =>
    new ResourceRun(plan).getSnapshot(),
  );

  const [ready, setReady] = useState(false);

  useEffect(() => {
    const run = runtime.start();
    const unsubscribe = run.subscribe(({ snapshot }) => {
      setSnapshot(snapshot);
    });

    void run
      .waitForReady()
      .then(() => {
        setReady(true);
      })
      .catch(() => undefined);
    void run.waitForAll().catch(() => undefined);

    return () => {
      unsubscribe();
      run.abort();
    };
  }, []);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Resource Runtime</h1>
          <p className="text-sm text-neutral-500">
            status: {snapshot.status} / ready: {ready ? "yes" : "no"}
          </p>
        </div>
        <div className="text-sm tabular-nums">
          {Math.round(snapshot.progress * 100)}%
        </div>
      </div>

      <progress className="h-2 w-full" value={snapshot.progress} max={1} />

      <div className="grid gap-3 md:grid-cols-2">
        {snapshot.groups.map((group) => (
          <div className="border border-neutral-200 p-3" key={group.key}>
            <div className="flex items-center justify-between">
              <span className="font-medium">{group.key}</span>
              <span className="text-sm text-neutral-500">{group.status}</span>
            </div>
            <div className="mt-2 text-sm text-neutral-500">
              {group.completedItems}/{group.totalItems} items
            </div>
          </div>
        ))}
      </div>

      {snapshot.errors.length > 0 ? (
        <div className="text-sm text-red-600">
          {snapshot.errors.length} resource errors recorded
        </div>
      ) : null}
    </div>
  );
};

export default ResourceManagerPage;
