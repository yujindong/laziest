export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace'

export type EnabledLogLevel = Exclude<LogLevel, 'silent'>

export type BuiltInLogFormat = 'pretty' | 'compact' | 'json'

export type LogContext = unknown

export interface LogRecord {
  time: Date
  level: EnabledLogLevel
  name?: string
  scope: readonly string[]
  message: string
  context?: LogContext
}

export interface Logger {
  error(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  debug(message: string, context?: LogContext): void
  trace(message: string, context?: LogContext): void
  child(scope: string, options?: ChildLoggerOptions): Logger
  isEnabled(level: EnabledLogLevel): boolean
}

export type LogTransport = (record: Readonly<LogRecord>) => void

export interface TransportObject {
  log(record: Readonly<LogRecord>): void
}

export type LogTransportLike = LogTransport | TransportObject

export interface LoggerOptions {
  name?: string
  level?: LogLevel
  transports?: readonly LogTransportLike[]
  onTransportError?: (
    error: unknown,
    record: Readonly<LogRecord>,
    transport: LogTransportLike,
  ) => void
}

export interface ChildLoggerOptions {
  level?: LogLevel
}

export type LogFormatter = (record: Readonly<LogRecord>) => unknown

export interface FormatterOptions {
  colors?: 'auto' | boolean
  timestamp?: 'time' | 'iso' | false
  context?: 'inline' | 'object' | 'both'
}

export interface ConsoleLike {
  error(...data: unknown[]): void
  warn(...data: unknown[]): void
  info(...data: unknown[]): void
  debug(...data: unknown[]): void
  trace(...data: unknown[]): void
}

export interface ConsoleTransportOptions extends FormatterOptions {
  format?: BuiltInLogFormat | LogFormatter
  console?: ConsoleLike
}
