# @laziest/logger Package Design

## Goal

Create a new standalone `@laziest/logger` package for use by applications and by other libraries in the monorepo or downstream projects.

The package should work in both browsers and Node.js, provide readable formatted output for humans, and still support structured output for logs that need to be collected or processed by machines. It should not depend on the current `resource-manager` logger implementation or inherit its API constraints.

## Scope

This design covers a first version of the logger package:

- A new `packages/logger` workspace package.
- A small core logger API.
- Log level filtering.
- Child loggers with scoped names.
- Multiple transports.
- Built-in console and memory transports.
- Built-in `pretty`, `compact`, and `json` formatters.
- Safe serialization for common difficult values.
- Tests and package documentation.

This design does not include file rotation, remote batching, browser devtools extensions, dynamic environment variable parsing, or automatic integration into existing packages.

## Recommended Architecture

Use a core event pipeline:

```txt
createLogger
  -> level filter
  -> LogRecord
  -> transports[]
       -> formatter preset or custom formatter
       -> writer
```

Logger methods do not write directly to `console`. They create a single `LogRecord`, then dispatch that record to every configured transport. This keeps filtering, formatting, and output responsibilities separate.

The same `LogRecord` is shared with all transports for a given log call, including the same timestamp. Transports are isolated from each other so one failing transport does not block the rest.

## Package Layout

```txt
packages/logger/
  package.json
  tsconfig.json
  tsdown.config.ts
  README.md
  src/
    index.ts
    core.ts
    levels.ts
    formatters/
      compact.ts
      json.ts
      pretty.ts
      shared.ts
    transports/
      console.ts
      memory.ts
    types.ts
  test/
    logger.spec.ts
    formatters.spec.ts
    transports.spec.ts
```

The package should follow existing monorepo conventions for `tsdown`, TypeScript, Vitest, package exports, license files, and build scripts.

## Public API

Example usage:

```ts
import { consoleTransport, createLogger } from '@laziest/logger'

const logger = createLogger({
  name: 'resource-manager',
  level: 'info',
  transports: [
    consoleTransport({ format: 'pretty' }),
  ],
})

logger.info('Resource loaded', { url: '/assets/a.png', durationMs: 42 })

const loader = logger.child('loader')
loader.debug('Retrying', { attempt: 2 })
```

Core types:

```ts
export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace'

export type EnabledLogLevel = Exclude<LogLevel, 'silent'>

export type LogContext = unknown

export interface Logger {
  error(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  debug(message: string, context?: LogContext): void
  trace(message: string, context?: LogContext): void
  child(scope: string, options?: ChildLoggerOptions): Logger
  isEnabled(level: EnabledLogLevel): boolean
}

export interface LogRecord {
  time: Date
  level: EnabledLogLevel
  name?: string
  scope: readonly string[]
  message: string
  context?: LogContext
}

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

export type LogTransportLike = LogTransport | TransportObject
```

Default behavior is library-friendly:

- `level` defaults to `silent`.
- No logs are emitted unless the consumer explicitly enables a level.
- Child loggers inherit parent configuration and append scope segments.
- Child logger options may override level for that child subtree.
- Context is accepted as `unknown`, but documentation should recommend plain objects such as `{ err }` for errors.

## Formatting Presets

### Pretty

Designed for local browser and terminal development.

Example:

```txt
[12:30:21.123] INFO  resource-manager:loader  Resource loaded
                    url=/assets/a.png durationMs=42
```

Rules:

- Use uppercase levels.
- Use colors by level when enabled.
- Render `name` and `scope` as a `:`-joined label.
- Prefer expandable console objects in browsers.
- Prefer readable `key=value` context output in Node.js.
- Render `Error` as `Name: message`, preserving stack for expansion or following lines.
- Multi-line output is acceptable when it improves readability.

### Compact

Designed for CI, terminals, copying, and `grep`.

Example:

```txt
12:30:21.123 info resource-manager:loader Resource loaded url=/assets/a.png durationMs=42
```

Rules:

- Single-line output.
- Use lowercase levels.
- Flatten context to `key=value` where practical.
- Use safe JSON summaries for nested objects.
- Render errors without a full stack by default.

### JSON

Designed for log collection and machine processing.

Example:

```json
{"time":"2026-05-19T04:30:21.123Z","level":"info","name":"resource-manager","scope":["loader"],"message":"Resource loaded","context":{"url":"/assets/a.png","durationMs":42}}
```

Rules:

- Single-line JSON string.
- Use ISO timestamps.
- Preserve structured context.
- Serialize `Error` values as `{ "name", "message", "stack" }`.
- Replace circular references with `"[Circular]"`.
- Do not emit colors.

### Shared Formatter Options

Console formatting should support:

```ts
type BuiltInLogFormat = 'pretty' | 'compact' | 'json'

type LogFormatter = (record: Readonly<LogRecord>) => unknown

interface FormatterOptions {
  colors?: 'auto' | boolean
  timestamp?: 'time' | 'iso' | false
  context?: 'inline' | 'object' | 'both'
}

interface ConsoleTransportOptions extends FormatterOptions {
  format?: BuiltInLogFormat | LogFormatter
  console?: ConsoleLike
}
```

`consoleTransport({ format: 'pretty' })` should be the default when a console transport is explicitly created. Pretty and compact default to local time display. JSON always uses ISO timestamps.

## Transports

Transports are the main extension point:

```ts
export type LogTransport = (record: Readonly<LogRecord>) => void

export interface TransportObject {
  log(record: Readonly<LogRecord>): void
}
```

`createLogger({ transports })` accepts an array of functions or transport objects.

Built-in transports:

- `consoleTransport(options)`: writes to a `console`-like object and supports built-in or custom formatting.
- `memoryTransport(records?)`: appends records to an array for tests, examples, and simple in-memory collection.

Multiple transport rules:

- Each enabled log call is dispatched to every transport in order.
- A transport failure does not prevent later transports from receiving the record.
- The record should be treated as immutable by transports.

## Error Isolation

Logging must not affect application control flow.

Rules:

- Transport errors are swallowed by default.
- Formatter errors are handled as transport errors.
- `onTransportError(error, record, transport)` can be configured for diagnostics.
- Transport error reporting must not recursively log through the same logger.
- Serialization must safely handle circular references, `Error`, `BigInt`, `Symbol`, functions, and unknown objects.

## Exports

The package should export:

```ts
export {
  createLogger,
  consoleTransport,
  memoryTransport,
  formatPretty,
  formatCompact,
  formatJson,
  shouldLog,
}

export type {
  BuiltInLogFormat,
  ChildLoggerOptions,
  ConsoleTransportOptions,
  EnabledLogLevel,
  FormatterOptions,
  LogContext,
  Logger,
  LoggerOptions,
  LogLevel,
  LogRecord,
  LogTransport,
  LogTransportLike,
  TransportObject,
}
```

The first version should avoid runtime dependencies. ANSI color support can be minimal and hand-written. Browser pretty output can use `%c` console formatting.

## Testing

Use Vitest. Required coverage:

- Level filtering for `silent`, `error`, `warn`, `info`, `debug`, and `trace`.
- `shouldLog` order and behavior.
- Logger methods create records with stable time, level, name, scope, message, and context.
- Child loggers inherit configuration and append scope.
- Child loggers can override level.
- Multiple transports are called in order.
- One throwing transport does not prevent later transports from running.
- `onTransportError` receives the thrown error and record.
- Formatter failures are isolated.
- Pretty, compact, and JSON formatters produce stable output for representative records.
- Safe serialization handles `Error`, `BigInt`, `Symbol`, functions, nested objects, and circular references.
- Console transport calls the expected console method for each level.
- Default logger configuration emits no logs.

## Documentation

`packages/logger/README.md` should include:

- Quick start.
- Application development setup using `level: 'debug'` and `pretty`.
- Library author setup using default `silent` and consumer-provided options.
- Browser and Node.js examples.
- Child logger examples.
- Multi-transport examples.
- A format comparison table for `pretty`, `compact`, and `json`.
- Guidance for logging errors with `{ err }`.

## Acceptance Criteria

- `@laziest/logger` is a standalone package.
- It builds with the repository's TypeScript and `tsdown` conventions.
- It has no runtime dependencies.
- It supports browser and Node.js usage.
- It defaults to silent output.
- It supports `pretty`, `compact`, and `json` formatter presets.
- It supports child loggers.
- It supports multiple transports.
- Transport and formatter failures do not throw from logger calls.
- Tests cover the public behavior listed above.
