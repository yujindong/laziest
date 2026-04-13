import type { ResourceFailure, RetryOptions } from './types'

const defaultRetryOptions: Required<Pick<RetryOptions, 'maxRetries' | 'delayMs' | 'backoff'>> = {
  maxRetries: 0,
  delayMs: 0,
  backoff: 'fixed',
}

export function isRetriableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

// Only fetch/network-shaped TypeErrors retry; everything else is treated as a deterministic bug.
const RETRIABLE_TYPE_ERROR_PATTERNS = [
  /failed to fetch/i,
  /fetch failed/i,
  /network error/i,
  /network request failed/i,
  /load failed/i,
]

export function isRetriableTypeError(error: TypeError): boolean {
  const message = error.message.trim()

  if (!message) {
    return false
  }

  return RETRIABLE_TYPE_ERROR_PATTERNS.some((pattern) => pattern.test(message))
}

export function normalizeRetryOptions(
  options: RetryOptions | undefined,
): Required<Pick<RetryOptions, 'maxRetries' | 'delayMs' | 'backoff'>> {
  return {
    maxRetries: Math.max(0, options?.maxRetries ?? defaultRetryOptions.maxRetries),
    delayMs: Math.max(0, options?.delayMs ?? defaultRetryOptions.delayMs),
    backoff: options?.backoff ?? defaultRetryOptions.backoff,
  }
}

export function shouldRetryFailure(
  failure: ResourceFailure,
  attempt: number,
  options: RetryOptions | undefined,
): boolean {
  if (options?.shouldRetry) {
    return options.shouldRetry(failure, attempt)
  }

  const normalized = normalizeRetryOptions(options)

  if (failure.category === 'unknown') {
    return attempt <= 1
  }

  if (!failure.retriable) {
    return false
  }

  return attempt <= normalized.maxRetries
}

export function getRetryDelayMs(
  attempt: number,
  options: RetryOptions | undefined,
): number {
  const normalized = normalizeRetryOptions(options)

  if (normalized.delayMs === 0) {
    return 0
  }

  switch (normalized.backoff) {
    case 'linear':
      return normalized.delayMs * attempt
    case 'exponential':
      return normalized.delayMs * 2 ** Math.max(0, attempt - 1)
    case 'fixed':
    default:
      return normalized.delayMs
  }
}

export async function waitForRetryDelay(ms: number): Promise<void> {
  if (ms <= 0) {
    return
  }

  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}
