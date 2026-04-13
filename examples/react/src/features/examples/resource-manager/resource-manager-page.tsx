import { ResourceManager, type ResourceBuckets } from "@laziest/web";
import { useEffect, useEffectEvent, useState } from "react";

const img1List = [
  "https://pintu-image.go.sohu.com/activities/2026-spring-festival-games/v1/game01/11title.png",
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

const manifest: ResourceBuckets = {
  images: [...img1List, ...img2List].map((url) => ({ url, optional: true })),
  fonts: [
    {
      url: "https://pintu-image.go.sohu.com/activities/fonts/FZLTDHK.TTF",
      family: "方正兰亭大黑",
      optional: true,
    },
  ],

  video: [
    "https://pintu-image.go.sohu.com/lingchuang/home/v2/feature01/bg-12604081100.mp4",
    "https://pintu-image.go.sohu.com/lingchuang/home/v2/feature01/loop-2604081100.mp4",
  ].map((url) => ({ url, optional: true })),
};
const resourceManager = new ResourceManager({
  concurrency: 3,
  logLevel: "debug",
});
const ResourceManagerPage = () => {
  const [progress, setProgress] = useState(0);
  const preload = useEffectEvent(async () => {
    await resourceManager.preload(manifest);
  });
  useEffect(() => {
    preload();
  }, []);
  useEffect(() => {
    return resourceManager.subscribe((item) => {
      setProgress(item.snapshot.progress);
    });
  }, []);
  return (
    <div>
      <progress className="w-full text-red-500" value={progress} />
    </div>
  );
};

export default ResourceManagerPage;
