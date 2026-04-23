import type { LogLevel, ResourceLogger } from './types'

const order: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
}

export function shouldLog(
  current: LogLevel,
  target: Exclude<LogLevel, 'silent'>,
): boolean {
  return order[current] >= order[target]
}

export function createFilteredResourceLogger(
  logger: ResourceLogger,
  level: LogLevel,
): ResourceLogger {
  function safeLog(method: keyof ResourceLogger, message: string, context?: unknown) {
    try {
      logger[method](message, context)
    } catch {
      // Logging must not affect preload control flow.
    }
  }

  return {
    error(message: string, context?: unknown) {
      if (shouldLog(level, 'error')) {
        safeLog('error', message, context)
      }
    },
    warn(message: string, context?: unknown) {
      if (shouldLog(level, 'warn')) {
        safeLog('warn', message, context)
      }
    },
    info(message: string, context?: unknown) {
      if (shouldLog(level, 'info')) {
        safeLog('info', message, context)
      }
    },
    debug(message: string, context?: unknown) {
      if (shouldLog(level, 'debug')) {
        safeLog('debug', message, context)
      }
    },
  }
}

export const consoleResourceLogger: ResourceLogger = console
