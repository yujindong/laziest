import { isBrowser } from "@laziest/utils";
import { useEffect, useLayoutEffect } from "react";

export const useIsomorphicLayoutEffect = isBrowser
  ? useLayoutEffect
  : useEffect;
