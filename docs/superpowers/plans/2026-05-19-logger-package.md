# Logger Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone `@laziest/logger` workspace package with scoped loggers, level filtering, built-in formatters, and multiple transports.

**Architecture:** Logger calls create immutable `LogRecord` values, filter by level, and dispatch records to one or more isolated transports. Formatters are separate pure functions used by transports, with safe serialization shared by compact and JSON output.

**Tech Stack:** TypeScript, tsdown, Vitest, pnpm workspace, no runtime dependencies.

---

## File Structure

- Create: `packages/logger/package.json` for package metadata, exports, and package-local scripts.
- Create: `packages/logger/tsconfig.json` for strict package-local TypeScript settings.
- Create: `packages/logger/tsdown.config.ts` for ESM/CJS bundles and declaration output.
- Create: `packages/logger/vitest.config.ts` for package-local tests.
- Create: `packages/logger/README.md` for public usage documentation.
- Create: `packages/logger/src/types.ts` for all public types.
- Create: `packages/logger/src/levels.ts` for level order and `shouldLog`.
- Create: `packages/logger/src/serializers.ts` for safe context serialization and inline rendering helpers.
- Create: `packages/logger/src/formatters/shared.ts` for common timestamp, label, color, and console argument helpers.
- Create: `packages/logger/src/formatters/pretty.ts` for pretty formatter.
- Create: `packages/logger/src/formatters/compact.ts` for compact formatter.
- Create: `packages/logger/src/formatters/json.ts` for JSON formatter.
- Create: `packages/logger/src/transports/console.ts` for console transport.
- Create: `packages/logger/src/transports/memory.ts` for memory transport.
- Create: `packages/logger/src/core.ts` for `createLogger`.
- Create: `packages/logger/src/index.ts` for public exports.
- Create: `packages/logger/test/levels.spec.ts` for level filtering tests.
- Create: `packages/logger/test/serializers.spec.ts` for safe serialization tests.
- Create: `packages/logger/test/formatters.spec.ts` for formatter tests.
- Create: `packages/logger/test/transports.spec.ts` for transport tests.
- Create: `packages/logger/test/logger.spec.ts` for core logger tests.
- Modify: `package.json` to add root `build:logger`, `test:logger`, and `test:logger:coverage` scripts.

## Tasks

### Task 1: Scaffold the Workspace Package

**Files:**
- Create: `packages/logger/package.json`
- Create: `packages/logger/tsconfig.json`
- Create: `packages/logger/tsdown.config.ts`
- Create: `packages/logger/vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Create package metadata**

Create `packages/logger/package.json`:

```json
{
  "name": "@laziest/logger",
  "version": "0.1.0",
  "type": "module",
  "license": "MIT",
  "files": [
    "dist",
    "LICENSE"
  ],
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.mts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.mts",
        "default": "./dist/index.mjs"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  },
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/"
  },
  "scripts": {
    "prepack": "node ../../scripts/copy-root-license.mjs",
    "build": "tsdown",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Create `packages/logger/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "declaration": true,
    "declarationMap": false,
    "sourceMap": true,
    "noEmit": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  },
  "include": ["src", "test", "tsdown.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Create bundler config**

Create `packages/logger/tsdown.config.ts`:

```ts
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  outDir: 'dist',
})
```

- [ ] **Step 4: Create Vitest config**

Create `packages/logger/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    restoreMocks: true,
    clearMocks: true,
    include: ['test/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
    },
  },
})
```

- [ ] **Step 5: Add root scripts**

Modify root `package.json` scripts by adding these entries next to the existing package scripts:

```json
{
  "build:logger": "pnpm --filter @laziest/logger build",
  "test:logger": "pnpm --filter @laziest/logger test",
  "test:logger:watch": "pnpm --filter @laziest/logger test:watch",
  "test:logger:coverage": "pnpm --filter @laziest/logger test:coverage"
}
```

- [ ] **Step 6: Verify scaffold commands fail because no source exists**

Run:

```bash
pnpm --filter @laziest/logger typecheck
```

Expected: FAIL because `src/index.ts` does not exist yet.

- [ ] **Step 7: Commit scaffold**

```bash
git add package.json packages/logger/package.json packages/logger/tsconfig.json packages/logger/tsdown.config.ts packages/logger/vitest.config.ts
git commit -m "feat(logger): scaffold package"
```

### Task 2: Add Public Types and Level Filtering

**Files:**
- Create: `packages/logger/src/types.ts`
- Create: `packages/logger/src/levels.ts`
- Create: `packages/logger/src/index.ts`
- Create: `packages/logger/test/levels.spec.ts`

- [ ] **Step 1: Write failing level tests**

Create `packages/logger/test/levels.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { shouldLog } from '../src/levels'
import type { EnabledLogLevel, LogLevel } from '../src/types'

describe('shouldLog', () => {
  it('disables every level when current level is silent', () => {
    const targets: EnabledLogLevel[] = ['error', 'warn', 'info', 'debug', 'trace']

    expect(targets.map((target) => shouldLog('silent', target))).toEqual([
      false,
      false,
      false,
      false,
      false,
    ])
  })

  it('allows messages at or above the configured level', () => {
    const cases: Array<[LogLevel, EnabledLogLevel, boolean]> = [
      ['error', 'error', true],
      ['error', 'warn', false],
      ['warn', 'error', true],
      ['warn', 'warn', true],
      ['warn', 'info', false],
      ['info', 'warn', true],
      ['info', 'debug', false],
      ['debug', 'info', true],
      ['debug', 'trace', false],
      ['trace', 'debug', true],
      ['trace', 'trace', true],
    ]

    for (const [current, target, expected] of cases) {
      expect(shouldLog(current, target)).toBe(expected)
    }
  })
})
```

- [ ] **Step 2: Run level tests to verify they fail**

Run:

```bash
pnpm --filter @laziest/logger test -- test/levels.spec.ts
```

Expected: FAIL with an import error for `../src/levels`.

- [ ] **Step 3: Add public types**

Create `packages/logger/src/types.ts`:

```ts
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
```

- [ ] **Step 4: Add level implementation**

Create `packages/logger/src/levels.ts`:

```ts
import type { EnabledLogLevel, LogLevel } from './types'

const levelOrder: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
}

export function shouldLog(
  current: LogLevel,
  target: EnabledLogLevel,
): boolean {
  return levelOrder[current] >= levelOrder[target]
}
```

- [ ] **Step 5: Add temporary public exports**

Create `packages/logger/src/index.ts`:

```ts
export { shouldLog } from './levels'
export type * from './types'
```

- [ ] **Step 6: Run level tests**

Run:

```bash
pnpm --filter @laziest/logger test -- test/levels.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit types and levels**

```bash
git add packages/logger/src/types.ts packages/logger/src/levels.ts packages/logger/src/index.ts packages/logger/test/levels.spec.ts
git commit -m "feat(logger): add levels and public types"
```

### Task 3: Add Safe Serialization Helpers

**Files:**
- Create: `packages/logger/src/serializers.ts`
- Create: `packages/logger/test/serializers.spec.ts`

- [ ] **Step 1: Write failing serializer tests**

Create `packages/logger/test/serializers.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { renderInlineContext, safeSerialize } from '../src/serializers'

describe('safeSerialize', () => {
  it('serializes errors into plain objects', () => {
    const error = new TypeError('failed')
    const result = safeSerialize({ err: error })

    expect(result).toMatchObject({
      err: {
        name: 'TypeError',
        message: 'failed',
      },
    })
  })

  it('handles circular references', () => {
    const value: { name: string; self?: unknown } = { name: 'loop' }
    value.self = value

    expect(safeSerialize(value)).toEqual({
      name: 'loop',
      self: '[Circular]',
    })
  })

  it('handles bigint, symbol, and functions', () => {
    const result = safeSerialize({
      big: 12n,
      symbol: Symbol.for('logger'),
      fn: function namedFunction() {
        return 'value'
      },
    })

    expect(result).toEqual({
      big: '12',
      symbol: 'Symbol(logger)',
      fn: '[Function namedFunction]',
    })
  })
})

describe('renderInlineContext', () => {
  it('renders flat objects as key=value pairs', () => {
    expect(renderInlineContext({ url: '/a.png', durationMs: 42 })).toBe(
      'url=/a.png durationMs=42',
    )
  })

  it('quotes string values with whitespace', () => {
    expect(renderInlineContext({ message: 'hello world' })).toBe(
      'message="hello world"',
    )
  })
})
```

- [ ] **Step 2: Run serializer tests to verify they fail**

Run:

```bash
pnpm --filter @laziest/logger test -- test/serializers.spec.ts
```

Expected: FAIL with an import error for `../src/serializers`.

- [ ] **Step 3: Implement safe serialization**

Create `packages/logger/src/serializers.ts`:

```ts
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function serializeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (typeof value === 'symbol') {
    return value.toString()
  }

  if (typeof value === 'function') {
    return `[Function ${value.name || 'anonymous'}]`
  }

  if (typeof value !== 'object' || value === null) {
    return value
  }

  if (seen.has(value)) {
    return '[Circular]'
  }

  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item, seen))
  }

  if (!isPlainObject(value)) {
    return String(value)
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      serializeValue(nestedValue, seen),
    ]),
  )
}

export function safeSerialize(value: unknown): unknown {
  return serializeValue(value, new WeakSet<object>())
}

function renderValue(value: unknown): string {
  if (typeof value === 'string') {
    return /\s/.test(value) ? JSON.stringify(value) : value
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null ||
    value === undefined
  ) {
    return String(value)
  }

  return JSON.stringify(value)
}

export function renderInlineContext(context: unknown): string {
  const serialized = safeSerialize(context)

  if (!isPlainObject(serialized)) {
    return renderValue(serialized)
  }

  return Object.entries(serialized)
    .map(([key, value]) => `${key}=${renderValue(value)}`)
    .join(' ')
}
```

- [ ] **Step 4: Run serializer tests**

Run:

```bash
pnpm --filter @laziest/logger test -- test/serializers.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit serializers**

```bash
git add packages/logger/src/serializers.ts packages/logger/test/serializers.spec.ts
git commit -m "feat(logger): add safe serialization"
```

### Task 4: Add Formatters

**Files:**
- Create: `packages/logger/src/formatters/shared.ts`
- Create: `packages/logger/src/formatters/pretty.ts`
- Create: `packages/logger/src/formatters/compact.ts`
- Create: `packages/logger/src/formatters/json.ts`
- Modify: `packages/logger/src/index.ts`
- Create: `packages/logger/test/formatters.spec.ts`

- [ ] **Step 1: Write failing formatter tests**

Create `packages/logger/test/formatters.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatCompact, formatJson, formatPretty } from '../src'
import type { LogRecord } from '../src'

const record: LogRecord = {
  time: new Date('2026-05-19T04:30:21.123Z'),
  level: 'info',
  name: 'resource-manager',
  scope: ['loader'],
  message: 'Resource loaded',
  context: { url: '/assets/a.png', durationMs: 42 },
}

describe('formatPretty', () => {
  it('renders a readable multi-part line', () => {
    expect(formatPretty(record, { colors: false })).toEqual([
      '[04:30:21.123] INFO  resource-manager:loader  Resource loaded',
      'url=/assets/a.png durationMs=42',
    ])
  })
})

describe('formatCompact', () => {
  it('renders a stable single line', () => {
    expect(formatCompact(record)).toBe(
      '04:30:21.123 info resource-manager:loader Resource loaded url=/assets/a.png durationMs=42',
    )
  })
})

describe('formatJson', () => {
  it('renders one JSON object per line', () => {
    expect(JSON.parse(formatJson(record))).toEqual({
      time: '2026-05-19T04:30:21.123Z',
      level: 'info',
      name: 'resource-manager',
      scope: ['loader'],
      message: 'Resource loaded',
      context: {
        url: '/assets/a.png',
        durationMs: 42,
      },
    })
  })
})
```

- [ ] **Step 2: Run formatter tests to verify they fail**

Run:

```bash
pnpm --filter @laziest/logger test -- test/formatters.spec.ts
```

Expected: FAIL with missing exports for `formatPretty`, `formatCompact`, and `formatJson`.

- [ ] **Step 3: Add shared formatter helpers**

Create `packages/logger/src/formatters/shared.ts`:

```ts
import type { EnabledLogLevel, FormatterOptions, LogRecord } from '../types'

const levelColors: Record<EnabledLogLevel, string> = {
  error: '\u001B[31m',
  warn: '\u001B[33m',
  info: '\u001B[36m',
  debug: '\u001B[90m',
  trace: '\u001B[35m',
}

const resetColor = '\u001B[0m'

export function formatTime(time: Date, mode: FormatterOptions['timestamp']): string {
  if (mode === false) {
    return ''
  }

  if (mode === 'iso') {
    return time.toISOString()
  }

  return time.toISOString().slice(11, 23)
}

export function formatLabel(record: Readonly<LogRecord>): string {
  const parts = [
    record.name,
    record.scope.length > 0 ? record.scope.join(':') : undefined,
  ].filter(Boolean)

  return parts.join(':')
}

export function colorLevel(
  level: EnabledLogLevel,
  value: string,
  colors: FormatterOptions['colors'],
): string {
  if (colors !== true) {
    return value
  }

  return `${levelColors[level]}${value}${resetColor}`
}
```

- [ ] **Step 4: Add pretty formatter**

Create `packages/logger/src/formatters/pretty.ts`:

```ts
import { renderInlineContext } from '../serializers'
import type { FormatterOptions, LogRecord } from '../types'
import { colorLevel, formatLabel, formatTime } from './shared'

export function formatPretty(
  record: Readonly<LogRecord>,
  options: FormatterOptions = {},
): string[] {
  const timestamp = formatTime(record.time, options.timestamp ?? 'time')
  const level = record.level.toUpperCase().padEnd(5, ' ')
  const coloredLevel = colorLevel(record.level, level, options.colors)
  const label = formatLabel(record)
  const prefix = timestamp ? `[${timestamp}] ${coloredLevel}` : coloredLevel
  const head = [prefix, label, record.message].filter(Boolean).join('  ')

  if (record.context === undefined || options.context === 'object') {
    return [head]
  }

  const inlineContext = renderInlineContext(record.context)
  return inlineContext ? [head, inlineContext] : [head]
}
```

- [ ] **Step 5: Add compact formatter**

Create `packages/logger/src/formatters/compact.ts`:

```ts
import { renderInlineContext } from '../serializers'
import type { FormatterOptions, LogRecord } from '../types'
import { formatLabel, formatTime } from './shared'

export function formatCompact(
  record: Readonly<LogRecord>,
  options: FormatterOptions = {},
): string {
  const parts = [
    formatTime(record.time, options.timestamp ?? 'time'),
    record.level,
    formatLabel(record),
    record.message,
    record.context === undefined ? '' : renderInlineContext(record.context),
  ].filter(Boolean)

  return parts.join(' ')
}
```

- [ ] **Step 6: Add JSON formatter**

Create `packages/logger/src/formatters/json.ts`:

```ts
import { safeSerialize } from '../serializers'
import type { LogRecord } from '../types'

export function formatJson(record: Readonly<LogRecord>): string {
  const payload = {
    time: record.time.toISOString(),
    level: record.level,
    name: record.name,
    scope: record.scope,
    message: record.message,
    context:
      record.context === undefined ? undefined : safeSerialize(record.context),
  }

  return JSON.stringify(payload)
}
```

- [ ] **Step 7: Export formatters**

Modify `packages/logger/src/index.ts`:

```ts
export { shouldLog } from './levels'
export { formatCompact } from './formatters/compact'
export { formatJson } from './formatters/json'
export { formatPretty } from './formatters/pretty'
export type * from './types'
```

- [ ] **Step 8: Run formatter tests**

Run:

```bash
pnpm --filter @laziest/logger test -- test/formatters.spec.ts
```

Expected: PASS.

- [ ] **Step 9: Commit formatters**

```bash
git add packages/logger/src/formatters packages/logger/src/index.ts packages/logger/test/formatters.spec.ts
git commit -m "feat(logger): add formatter presets"
```

### Task 5: Add Console and Memory Transports

**Files:**
- Create: `packages/logger/src/transports/console.ts`
- Create: `packages/logger/src/transports/memory.ts`
- Modify: `packages/logger/src/index.ts`
- Create: `packages/logger/test/transports.spec.ts`

- [ ] **Step 1: Write failing transport tests**

Create `packages/logger/test/transports.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { consoleTransport, memoryTransport } from '../src'
import type { ConsoleLike, LogRecord } from '../src'

const record: LogRecord = {
  time: new Date('2026-05-19T04:30:21.123Z'),
  level: 'warn',
  name: 'app',
  scope: ['loader'],
  message: 'Retrying',
  context: { attempt: 2 },
}

describe('memoryTransport', () => {
  it('appends records to the provided array', () => {
    const records: Readonly<LogRecord>[] = []
    const transport = memoryTransport(records)

    transport(record)

    expect(records).toEqual([record])
  })
})

describe('consoleTransport', () => {
  it('uses the console method matching the record level', () => {
    const consoleLike: ConsoleLike = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
    }

    const transport = consoleTransport({
      console: consoleLike,
      format: 'compact',
    })

    transport(record)

    expect(consoleLike.warn).toHaveBeenCalledWith(
      '04:30:21.123 warn app:loader Retrying attempt=2',
    )
    expect(consoleLike.error).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run transport tests to verify they fail**

Run:

```bash
pnpm --filter @laziest/logger test -- test/transports.spec.ts
```

Expected: FAIL with missing exports for `consoleTransport` and `memoryTransport`.

- [ ] **Step 3: Implement memory transport**

Create `packages/logger/src/transports/memory.ts`:

```ts
import type { LogRecord, LogTransport } from '../types'

export function memoryTransport(
  records: Readonly<LogRecord>[] = [],
): LogTransport {
  return (record) => {
    records.push(record)
  }
}
```

- [ ] **Step 4: Implement console transport**

Create `packages/logger/src/transports/console.ts`:

```ts
import { formatCompact } from '../formatters/compact'
import { formatJson } from '../formatters/json'
import { formatPretty } from '../formatters/pretty'
import type {
  BuiltInLogFormat,
  ConsoleLike,
  ConsoleTransportOptions,
  LogFormatter,
  LogRecord,
  LogTransport,
} from '../types'

const defaultConsole: ConsoleLike = console

function resolveFormatter(
  format: BuiltInLogFormat | LogFormatter | undefined,
  options: ConsoleTransportOptions,
): LogFormatter {
  if (typeof format === 'function') {
    return format
  }

  switch (format ?? 'pretty') {
    case 'compact':
      return (record) => formatCompact(record, options)
    case 'json':
      return (record) => formatJson(record)
    case 'pretty':
      return (record) => formatPretty(record, options)
  }
}

function asConsoleArgs(formatted: unknown): unknown[] {
  return Array.isArray(formatted) ? formatted : [formatted]
}

export function consoleTransport(
  options: ConsoleTransportOptions = {},
): LogTransport {
  const writer = options.console ?? defaultConsole
  const formatter = resolveFormatter(options.format, options)

  return (record: Readonly<LogRecord>) => {
    writer[record.level](...asConsoleArgs(formatter(record)))
  }
}
```

- [ ] **Step 5: Export transports**

Modify `packages/logger/src/index.ts`:

```ts
export { shouldLog } from './levels'
export { formatCompact } from './formatters/compact'
export { formatJson } from './formatters/json'
export { formatPretty } from './formatters/pretty'
export { consoleTransport } from './transports/console'
export { memoryTransport } from './transports/memory'
export type * from './types'
```

- [ ] **Step 6: Run transport tests**

Run:

```bash
pnpm --filter @laziest/logger test -- test/transports.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit transports**

```bash
git add packages/logger/src/transports packages/logger/src/index.ts packages/logger/test/transports.spec.ts
git commit -m "feat(logger): add transports"
```

### Task 6: Add Core Logger

**Files:**
- Create: `packages/logger/src/core.ts`
- Modify: `packages/logger/src/index.ts`
- Create: `packages/logger/test/logger.spec.ts`

- [ ] **Step 1: Write failing core logger tests**

Create `packages/logger/test/logger.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createLogger } from '../src'
import type { LogRecord, LogTransportLike } from '../src'

describe('createLogger', () => {
  it('defaults to silent output', () => {
    const transport = vi.fn()
    const logger = createLogger({ transports: [transport] })

    logger.error('failed')

    expect(transport).not.toHaveBeenCalled()
  })

  it('creates log records for enabled levels', () => {
    const records: Readonly<LogRecord>[] = []
    const logger = createLogger({
      name: 'app',
      level: 'info',
      transports: [(record) => records.push(record)],
    })

    logger.info('ready', { port: 3000 })
    logger.debug('hidden')

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      level: 'info',
      name: 'app',
      scope: [],
      message: 'ready',
      context: { port: 3000 },
    })
    expect(records[0]?.time).toBeInstanceOf(Date)
  })

  it('supports child scopes', () => {
    const records: Readonly<LogRecord>[] = []
    const logger = createLogger({
      name: 'app',
      level: 'debug',
      transports: [(record) => records.push(record)],
    })

    logger.child('loader').child('image').debug('loaded')

    expect(records[0]).toMatchObject({
      name: 'app',
      scope: ['loader', 'image'],
      message: 'loaded',
    })
  })

  it('allows child loggers to override level', () => {
    const records: Readonly<LogRecord>[] = []
    const logger = createLogger({
      name: 'app',
      level: 'error',
      transports: [(record) => records.push(record)],
    })

    logger.child('loader', { level: 'debug' }).debug('visible')

    expect(records).toHaveLength(1)
    expect(records[0]?.level).toBe('debug')
  })

  it('isolates transport failures and calls onTransportError', () => {
    const error = new Error('transport failed')
    const throwingTransport = vi.fn(() => {
      throw error
    })
    const workingTransport = vi.fn()
    const onTransportError = vi.fn()
    const transports: LogTransportLike[] = [throwingTransport, workingTransport]
    const logger = createLogger({
      level: 'info',
      transports,
      onTransportError,
    })

    expect(() => logger.info('ready')).not.toThrow()
    expect(workingTransport).toHaveBeenCalledTimes(1)
    expect(onTransportError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ message: 'ready' }),
      throwingTransport,
    )
  })

  it('swallows onTransportError failures', () => {
    const logger = createLogger({
      level: 'info',
      transports: [
        () => {
          throw new Error('transport failed')
        },
      ],
      onTransportError() {
        throw new Error('handler failed')
      },
    })

    expect(() => logger.info('ready')).not.toThrow()
  })
})
```

- [ ] **Step 2: Run core tests to verify they fail**

Run:

```bash
pnpm --filter @laziest/logger test -- test/logger.spec.ts
```

Expected: FAIL with a missing export for `createLogger`.

- [ ] **Step 3: Implement core logger**

Create `packages/logger/src/core.ts`:

```ts
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
  TransportObject,
} from './types'

interface InternalLoggerOptions extends LoggerOptions {
  scope?: readonly string[]
}

function isTransportObject(transport: LogTransportLike): transport is TransportObject {
  return typeof transport === 'object' && transport !== null && 'log' in transport
}

function dispatchTransport(
  transport: LogTransportLike,
  record: Readonly<LogRecord>,
): void {
  if (isTransportObject(transport)) {
    transport.log(record)
    return
  }

  transport(record)
}

export function createLogger(options: InternalLoggerOptions = {}): Logger {
  const name = options.name
  const level: LogLevel = options.level ?? 'silent'
  const scope = [...(options.scope ?? [])]
  const transports = [...(options.transports ?? [])]
  const onTransportError = options.onTransportError

  function write(targetLevel: EnabledLogLevel, message: string, context?: LogContext) {
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
          // Logging must not affect application control flow.
        }
      }
    }
  }

  return {
    error(message, context) {
      write('error', message, context)
    },
    warn(message, context) {
      write('warn', message, context)
    },
    info(message, context) {
      write('info', message, context)
    },
    debug(message, context) {
      write('debug', message, context)
    },
    trace(message, context) {
      write('trace', message, context)
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
}
```

- [ ] **Step 4: Export core logger**

Modify `packages/logger/src/index.ts`:

```ts
export { createLogger } from './core'
export { shouldLog } from './levels'
export { formatCompact } from './formatters/compact'
export { formatJson } from './formatters/json'
export { formatPretty } from './formatters/pretty'
export { consoleTransport } from './transports/console'
export { memoryTransport } from './transports/memory'
export type * from './types'
```

- [ ] **Step 5: Run core tests**

Run:

```bash
pnpm --filter @laziest/logger test -- test/logger.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Run all logger tests**

Run:

```bash
pnpm --filter @laziest/logger test
```

Expected: PASS.

- [ ] **Step 7: Commit core logger**

```bash
git add packages/logger/src/core.ts packages/logger/src/index.ts packages/logger/test/logger.spec.ts
git commit -m "feat(logger): add core logger"
```

### Task 7: Add Documentation and Final Verification

**Files:**
- Create: `packages/logger/README.md`
- Modify: `packages/logger/src/types.ts`
- Modify: `packages/logger/src/transports/console.ts`

- [ ] **Step 1: Add README**

Create `packages/logger/README.md`:

```md
# @laziest/logger

Small logger for browser and Node.js libraries and applications.

## Install

\`\`\`sh
pnpm add @laziest/logger
\`\`\`

## Quick Start

\`\`\`ts
import { consoleTransport, createLogger } from '@laziest/logger'

const logger = createLogger({
  name: 'app',
  level: 'debug',
  transports: [consoleTransport({ format: 'pretty' })],
})

logger.info('App started', { port: 3000 })
logger.child('loader').debug('Loaded resource', { url: '/hero.png' })
\`\`\`

## Formats

### Pretty

\`\`\`txt
[12:30:21.123] INFO  app:loader  Loaded resource
url=/hero.png
\`\`\`

### Compact

\`\`\`txt
12:30:21.123 info app:loader Loaded resource url=/hero.png
\`\`\`

### JSON

\`\`\`json
{"time":"2026-05-19T04:30:21.123Z","level":"info","name":"app","scope":["loader"],"message":"Loaded resource","context":{"url":"/hero.png"}}
\`\`\`

## Library Defaults

The logger defaults to `silent`, so libraries can accept user-provided logger options without writing to the console by default.

\`\`\`ts
const logger = createLogger({
  name: 'my-library',
  transports: [consoleTransport()],
})

logger.info('Hidden until level is enabled')
\`\`\`

## Multiple Transports

\`\`\`ts
import { consoleTransport, createLogger, memoryTransport } from '@laziest/logger'

const records = []
const logger = createLogger({
  level: 'info',
  transports: [
    consoleTransport({ format: 'compact' }),
    memoryTransport(records),
  ],
})
\`\`\`

## Errors

Prefer logging errors as context:

\`\`\`ts
logger.error('Request failed', { err })
\`\`\`
```

- [ ] **Step 2: Add explicit `LogTransportLike` export if missing**

Confirm `packages/logger/src/types.ts` includes:

```ts
export type LogTransportLike = LogTransport | TransportObject
```

If it is missing, add that exact line after `TransportObject`.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm --filter @laziest/logger typecheck
```

Expected: PASS.

- [ ] **Step 4: Run tests with coverage**

Run:

```bash
pnpm --filter @laziest/logger test:coverage
```

Expected: PASS with coverage output for `src/**/*.ts`.

- [ ] **Step 5: Run build**

Run:

```bash
pnpm --filter @laziest/logger build
```

Expected: PASS and create `packages/logger/dist/index.mjs`, `packages/logger/dist/index.cjs`, and declaration files.

- [ ] **Step 6: Run root logger scripts**

Run:

```bash
pnpm build:logger
pnpm test:logger
```

Expected: both commands PASS.

- [ ] **Step 7: Check workspace status**

Run:

```bash
git status --short
```

Expected: only intended logger package files, root `package.json`, and generated coverage or dist output if the repository does not ignore them. Do not commit generated `dist` or `coverage` if they are ignored or should not be tracked.

- [ ] **Step 8: Commit documentation and verification updates**

```bash
git add package.json packages/logger
git commit -m "docs(logger): add usage guide"
```

## Final Verification

After all tasks are complete, run:

```bash
pnpm --filter @laziest/logger typecheck
pnpm --filter @laziest/logger test
pnpm --filter @laziest/logger build
```

Expected: all commands PASS.

Then run:

```bash
git log --oneline -5
git status --short
```

Expected: recent logger commits are present and the worktree has no unintended changes.
