import { describe, expect, it, vi } from 'vitest'

import { consoleTransport, memoryTransport } from '../src'
import type { LogRecord } from '../src'

describe('memoryTransport', () => {
  it('appends records to the provided array', () => {
    const records: Readonly<LogRecord>[] = []
    const record: LogRecord = {
      time: new Date('2026-05-19T04:30:21.123Z'),
      level: 'info',
      scope: [],
      message: 'Loaded',
    }

    memoryTransport(records)(record)

    expect(records).toEqual([record])
  })
})

describe('consoleTransport', () => {
  it('writes compact output to the console method matching the record level', () => {
    const consoleLike = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
    }
    const record: LogRecord = {
      time: new Date('2026-05-19T04:30:21.123Z'),
      level: 'warn',
      name: 'app',
      scope: ['loader'],
      message: 'Retrying',
      context: { attempt: 2 },
    }

    consoleTransport({ console: consoleLike, format: 'compact' })(record)

    expect(consoleLike.warn).toHaveBeenCalledWith(
      '04:30:21.123 warn app:loader Retrying attempt=2',
    )
  })

  it('spreads array output from a custom formatter', () => {
    const consoleLike = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
    }
    const formatter = vi.fn(() => ['msg', { a: 1 }])
    const record: LogRecord = {
      time: new Date('2026-05-19T04:30:21.123Z'),
      level: 'debug',
      scope: [],
      message: 'Loaded',
    }
    const transport = consoleTransport({ console: consoleLike, format: formatter })

    transport(record)

    expect(formatter).toHaveBeenCalledWith(record)
    expect(consoleLike.debug).toHaveBeenCalledWith('msg', { a: 1 })
  })
})
