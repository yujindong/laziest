export const isBrowser = !!(
  typeof window !== "undefined" &&
  window.document &&
  window.addEventListener
);
