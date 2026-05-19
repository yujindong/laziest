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
})
