import type { ResourceFailure, RetryOptions } from '../shared/types'

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

function createAbortError(): DOMException | Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('Aborted', 'AbortError')
  }

  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

async function waitForRetryDelayOrAbort(
  ms: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (ms <= 0) {
    if (signal?.aborted) {
      throw signal.reason ?? createAbortError()
    }
    return
  }

  if (!signal) {
    await waitForRetryDelay(ms)
    return
  }

  if (signal.aborted) {
    throw signal.reason ?? createAbortError()
  }

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
    }
    const timeout = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
    const onAbort = () => {
      cleanup()
      reject(signal.reason ?? createAbortError())
    }

    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export interface RunWithRetryOptions {
  retry?: RetryOptions
  signal?: AbortSignal
  createFailure(cause: unknown, attempt: number): ResourceFailure
  onRetry?(failure: ResourceFailure, retryAfterMs: number): void
}

export async function runWithRetry<T>(
  operation: (attempt: number) => PromiseLike<T> | T,
  options: RunWithRetryOptions,
): Promise<T> {
  let attempt = 0

  while (true) {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? createAbortError()
    }

    attempt += 1

    try {
      return await operation(attempt)
    } catch (cause) {
      const failure = options.createFailure(cause, attempt)

      if (!shouldRetryFailure(failure, attempt, options.retry)) {
        throw failure
      }

      const retryAfterMs = getRetryDelayMs(attempt, options.retry)
      options.onRetry?.(failure, retryAfterMs)
      await waitForRetryDelayOrAbort(retryAfterMs, options.signal)
    }
  }
}
