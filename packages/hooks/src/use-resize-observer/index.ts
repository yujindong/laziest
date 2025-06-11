import ResizeObserver from "resize-observer-polyfill";

import { RefObject, useEffect, useState } from "react";
export type Size = { width: number; height: number };
export function useResizeObserver(ref: RefObject<HTMLElement | null>) {
  const [state, setState] = useState<Size | undefined>(undefined);
  useEffect(() => {
    if (!ref.current) {
      return;
    }
    const resizeObserver = new ResizeObserver(entrys => {
      entrys.forEach(entry => {
        const { clientWidth, clientHeight } = entry.target;
        setState({ width: clientWidth, height: clientHeight });
      });
    });
    resizeObserver.observe(ref.current);
    return () => {
      resizeObserver.disconnect();
    };
  }, [ref]);
  return state;
}
