import { shouldLog } from './levels'
import type {
  ChildLoggerOptions,
  EnabledLogLevel,
  Logger,
  LoggerOptions,
  LogContext,
  LogLevel,
  LogRecord,
  LogTransportLike,
} from './types'

interface InternalLoggerOptions extends LoggerOptions {
  scope?: readonly string[]
}

function dispatchTransport(
  transport: LogTransportLike,
  record: Readonly<LogRecord>,
): void {
  if (typeof transport === 'function') {
    transport(record)
    return
  }

  transport.log(record)
}

export function createLogger(options: InternalLoggerOptions = {}): Logger {
  const name = options.name
  const level: LogLevel = options.level ?? 'silent'
  const scope = [...(options.scope ?? [])]
  const transports = [...(options.transports ?? [])]
  const onTransportError = options.onTransportError

  function emit(targetLevel: EnabledLogLevel, message: string, context?: LogContext): void {
    if (!shouldLog(level, targetLevel)) {
      return
    }

    const record: LogRecord = {
      time: new Date(),
      level: targetLevel,
      name,
      scope,
      message,
      context,
    }

    for (const transport of transports) {
      try {
        dispatchTransport(transport, record)
      } catch (error) {
        try {
          onTransportError?.(error, record, transport)
        } catch {
          // Transport error handlers must not break logger calls.
        }
      }
    }
  }

  const logger: Logger = {
    error(message, context) {
      emit('error', message, context)
    },
    warn(message, context) {
      emit('warn', message, context)
    },
    info(message, context) {
      emit('info', message, context)
    },
    debug(message, context) {
      emit('debug', message, context)
    },
    trace(message, context) {
      emit('trace', message, context)
    },
    child(childScope: string, childOptions: ChildLoggerOptions = {}) {
      return createLogger({
        name,
        level: childOptions.level ?? level,
        transports,
        onTransportError,
        scope: [...scope, childScope],
      })
    },
    isEnabled(targetLevel) {
      return shouldLog(level, targetLevel)
    },
  }

  return logger
}
