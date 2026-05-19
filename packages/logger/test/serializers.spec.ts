import { describe, expect, it } from 'vitest'

import { renderInlineContext, safeSerialize } from '../src/serializers'

describe('safeSerialize', () => {
  it('serializes Error into a plain object with name, message, and stack', () => {
    const error = new TypeError('bad input')

    expect(safeSerialize(error)).toEqual({
      name: 'TypeError',
      message: 'bad input',
      stack: error.stack,
    })
  })

  it('handles circular references with [Circular]', () => {
    const context: { name: string; self?: unknown } = { name: 'root' }
    context.self = context

    expect(safeSerialize(context)).toEqual({
      name: 'root',
      self: '[Circular]',
    })
  })

  it('does not mark shared sibling references as circular', () => {
    const shared = { value: 'same' }

    expect(safeSerialize({ first: shared, second: shared })).toEqual({
      first: { value: 'same' },
      second: { value: 'same' },
    })
  })

  it('handles bigint, symbol, and functions', () => {
    function namedFunction() {}

    expect(
      safeSerialize({
        bigint: 123n,
        symbol: Symbol('token'),
        named: namedFunction,
        anonymous: () => undefined,
      }),
    ).toEqual({
      bigint: '123',
      symbol: 'Symbol(token)',
      named: '[Function namedFunction]',
      anonymous: '[Function anonymous]',
    })
  })

  it('produces JSON-stringifiable output for combined BigInt and circular data', () => {
    const context: { count: bigint; self?: unknown } = { count: 2n }
    context.self = context

    expect(JSON.stringify(safeSerialize(context))).toBe('{"count":"2","self":"[Circular]"}')
  })

  it('preserves and safely serializes Error enumerable fields', () => {
    const error = new Error('failed') as Error & {
      code?: bigint
      cause?: unknown
      self?: unknown
    }
    error.code = 500n
    error.cause = { retry: false }
    error.self = error

    expect(safeSerialize({ error })).toEqual({
      error: {
        name: 'Error',
        message: 'failed',
        stack: error.stack,
        code: '500',
        cause: { retry: false },
        self: '[Circular]',
      },
    })
  })
})

describe('renderInlineContext', () => {
  it('renders flat objects as key=value pairs', () => {
    expect(renderInlineContext({ requestId: 'abc123', status: 200, ok: true })).toBe(
      'requestId=abc123 status=200 ok=true',
    )
  })

  it('quotes string values with whitespace', () => {
    expect(renderInlineContext({ message: 'hello world', path: '/tmp/file' })).toBe(
      'message="hello world" path=/tmp/file',
    )
  })

  it('does not throw on a hostile object whose toString throws', () => {
    class Hostile {
      toString() {
        throw new Error('hostile')
      }
    }

    expect(() => renderInlineContext(new Hostile())).not.toThrow()
  })
})
