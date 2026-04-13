import { isRetriableStatus, isRetriableTypeError } from './retry'
import type {
  AbortedPreloadResult,
  FailedPreloadResult,
  NormalizedResourceItem,
  ResourceFailure,
  ResourceWarning,
} from './types'

export class ResourcePreloadError extends Error {
  readonly result: FailedPreloadResult | AbortedPreloadResult

  constructor(
    message: string,
    result: FailedPreloadResult | AbortedPreloadResult,
  ) {
    super(message)
    this.name = 'ResourcePreloadError'
    this.result = result
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

function isTimeoutError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'TimeoutError') ||
    (error instanceof Error && error.name === 'TimeoutError')
  )
}

export function createResourceFailure(
  item: NormalizedResourceItem,
  cause: unknown,
  attempt: number,
): ResourceFailure {
  if (cause instanceof Response) {
    const status = cause.status
    const statusText = cause.statusText.trim()

    return {
      category: 'http',
      code: `HTTP_${status}`,
      status,
      retriable: isRetriableStatus(status),
      message: statusText ? `HTTP ${status} ${statusText}` : `HTTP ${status}`,
      cause,
      url: item.url,
      type: item.type,
      attempt,
    }
  }

  if (isAbortError(cause)) {
    return {
      category: 'abort',
      code: 'ABORTED',
      retriable: false,
      message: cause instanceof Error && cause.message ? cause.message : 'Aborted',
      cause,
      url: item.url,
      type: item.type,
      attempt,
    }
  }

  if (isTimeoutError(cause)) {
    return {
      category: 'timeout',
      code: 'TIMEOUT',
      retriable: true,
      message: cause instanceof Error && cause.message ? cause.message : 'Timed out',
      cause,
      url: item.url,
      type: item.type,
      attempt,
    }
  }

  if (cause instanceof TypeError && isRetriableTypeError(cause)) {
    return {
      category: 'network',
      code: 'NETWORK_ERROR',
      retriable: true,
      message: cause.message || 'Network error',
      cause,
      url: item.url,
      type: item.type,
      attempt,
    }
  }

  return {
    category: 'unknown',
    code: 'unknown',
    retriable: false,
    message:
      cause instanceof Error && cause.message ? cause.message : 'Resource load failed',
    cause,
    url: item.url,
    type: item.type,
    attempt,
  }
}

export function createResourceSkippedWarning(
  failure: ResourceFailure,
): ResourceWarning {
  return {
    code: 'OPTIONAL_RESOURCE_SKIPPED',
    message: `Skipped optional ${failure.type} resource at ${failure.url} after ${failure.code}`,
    url: failure.url,
    type: failure.type,
  }
}
