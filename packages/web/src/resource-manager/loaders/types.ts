import type { NormalizedResourceItem, ResourceLoadContext } from '../types'

export type BrowserLoaderContext = ResourceLoadContext

export type BrowserLoader = (
  item: NormalizedResourceItem,
  context: BrowserLoaderContext,
) => PromiseLike<unknown> | unknown

class ResourceLoaderError extends Error {
  readonly resourceFailureCategory: 'parse' | 'decode'

  constructor(message: string, category: 'parse' | 'decode') {
    super(message)
    this.name = category === 'parse' ? 'ResourceParseError' : 'ResourceDecodeError'
    this.resourceFailureCategory = category
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class ResourceParseError extends ResourceLoaderError {
  constructor(message: string) {
    super(message, 'parse')
  }
}

export class ResourceDecodeError extends ResourceLoaderError {
  constructor(message: string) {
    super(message, 'decode')
  }
}

export function createAbortError(reason?: unknown): Error {
  if (reason instanceof Error) {
    return reason
  }

  if (typeof DOMException !== 'undefined') {
    return new DOMException('Aborted', 'AbortError')
  }

  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

export function createRequestInit(
  item: NormalizedResourceItem,
  signal: AbortSignal,
): RequestInit {
  return item.requestInit ? { ...item.requestInit, signal } : { signal }
}

export function isResourceLoaderError(
  error: unknown,
): error is ResourceLoaderError {
  return error instanceof ResourceLoaderError
}
