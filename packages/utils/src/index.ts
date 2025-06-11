/* eslint-disable @typescript-eslint/no-explicit-any */
export * from "./is-browser";
export const isFunction = (
  value: unknown,
): value is (...args: never) => unknown => typeof value === "function";
export const isObject = (value: unknown): value is Record<any, any> =>
  value !== null && typeof value === "object";

export const isString = (value: unknown): value is string =>
  typeof value === "string";
export const isBoolean = (value: unknown): value is boolean =>
  typeof value === "boolean";
export const isNumber = (value: unknown): value is number =>
  typeof value === "number";
export const isUndef = (value: unknown): value is undefined =>
  typeof value === "undefined";
