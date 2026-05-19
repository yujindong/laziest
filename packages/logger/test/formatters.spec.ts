import { describe, expect, it } from 'vitest'

import { formatCompact, formatJson, formatPretty } from '../src'
import type { LogRecord } from '../src'

const record: LogRecord = {
  time: new Date('2026-05-19T04:30:21.123Z'),
  level: 'info',
  name: 'resource-manager',
  scope: ['loader'],
  message: 'Resource loaded',
  context: {
    url: '/assets/a.png',
    durationMs: 42,
  },
}

describe('formatPretty', () => {
  it('renders a human-readable multi-line record', () => {
    expect(formatPretty(record, { colors: false })).toEqual([
      '[04:30:21.123] INFO  resource-manager:loader  Resource loaded',
      'url=/assets/a.png durationMs=42',
    ])
  })
})

describe('formatCompact', () => {
  it('renders a single-line record with inline context', () => {
    expect(formatCompact(record)).toBe(
      '04:30:21.123 info resource-manager:loader Resource loaded url=/assets/a.png durationMs=42',
    )
  })
})

describe('formatJson', () => {
  it('renders structured JSON with ISO time and context', () => {
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
