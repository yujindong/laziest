import { describe, expect, it } from 'vitest'

import { shouldLog } from '../src/levels'
import type { EnabledLogLevel, LogLevel } from '../src/types'

describe('shouldLog', () => {
  it('disables every target level when current level is silent', () => {
    const targets = ['error', 'warn', 'info', 'debug', 'trace'] as const satisfies readonly EnabledLogLevel[]

    for (const target of targets) {
      expect(shouldLog('silent', target)).toBe(false)
    }
  })

  it('allows messages at or above the configured level', () => {
    const cases = [
      ['error', 'error', true],
      ['error', 'warn', false],
      ['warn', 'error', true],
      ['warn', 'warn', true],
      ['warn', 'info', false],
      ['info', 'warn', true],
      ['info', 'info', true],
      ['info', 'debug', false],
      ['debug', 'info', true],
      ['debug', 'debug', true],
      ['debug', 'trace', false],
      ['trace', 'debug', true],
      ['trace', 'trace', true],
    ] as const satisfies readonly [LogLevel, EnabledLogLevel, boolean][]

    for (const [current, target, expected] of cases) {
      expect(shouldLog(current, target)).toBe(expected)
    }
  })
})
