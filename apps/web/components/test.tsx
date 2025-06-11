"use client";

import { useResizeObserver } from "@laziest/hooks";
import { useRef } from "react";

const Test = () => {
  const ref = useRef<HTMLDivElement>(null);
  const size = useResizeObserver(ref);
  return (
    <div>
      <div>
        <p className="border-2">duanluo</p>
      </div>
      <div>line</div>
      <div className="border-4 box-border" ref={ref}>
        {size ? JSON.stringify(size) : ""}
        <span className="py-20">11111</span>
        <span className="px-4">22222</span>
        Test{1}
      </div>
      <div>aaa</div>
    </div>
  );
};

export default Test;
