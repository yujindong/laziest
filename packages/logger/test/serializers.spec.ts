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

  it('preserves Error fields when an enumerable getter throws', () => {
    const error = new Error('failed')

    Object.defineProperty(error, 'field', {
      enumerable: true,
      get() {
        throw new Error('bad getter')
      },
    })

    expect(safeSerialize(error)).toEqual({
      name: 'Error',
      message: 'failed',
      stack: error.stack,
      field: '[Thrown: bad getter]',
    })
  })

  it('does not throw when Error.message getter throws', () => {
    const error = new Error('failed')

    Object.defineProperty(error, 'message', {
      get() {
        throw new Error('message getter')
      },
    })

    expect(safeSerialize(error)).toMatchObject({
      name: 'Error',
      message: '[Thrown: message getter]',
    })
  })

  it('does not throw for a Proxy with a throwing getPrototypeOf trap', () => {
    const context = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('prototype trap')
        },
      },
    )

    expect(() => safeSerialize(context)).not.toThrow()
  })

  it('does not throw for a Proxy with a throwing descriptor trap', () => {
    const context = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error('descriptor trap')
        },
        ownKeys() {
          return ['field']
        },
      },
    )

    expect(safeSerialize(context)).toEqual('[Thrown: descriptor trap]')
  })

  it('preserves Error core fields when enumerable descriptor collection throws', () => {
    const error = new Proxy(new Error('failed'), {
      getOwnPropertyDescriptor() {
        throw new Error('descriptor trap')
      },
      ownKeys() {
        return ['field']
      },
    })

    const serialized = safeSerialize(error)

    expect(serialized).toMatchObject({
      name: 'Error',
      message: 'failed',
      fields: '[Thrown: descriptor trap]',
    })
    expect(serialized).toHaveProperty('stack')
  })

  it('handles an array with a throwing accessor element', () => {
    const values = ['ok']
    Object.defineProperty(values, '1', {
      enumerable: true,
      get() {
        throw new Error('array getter')
      },
    })

    expect(safeSerialize(values)).toEqual(['ok', '[Thrown: array getter]'])
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

  it('does not throw on a plain object with an enumerable getter that throws', () => {
    const context = {
      get field() {
        throw new Error('bad getter')
      },
    }

    expect(renderInlineContext(context)).toBe('field="[Thrown: bad getter]"')
  })

  it('does not throw when Error.stack getter throws', () => {
    const error = new Error('failed')

    Object.defineProperty(error, 'stack', {
      get() {
        throw new Error('stack getter')
      },
    })

    expect(() => renderInlineContext(error)).not.toThrow()
    expect(renderInlineContext(error)).toContain('stack="[Thrown: stack getter]"')
  })

  it('does not throw for a Proxy with a throwing getPrototypeOf trap', () => {
    const context = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('prototype trap')
        },
      },
    )

    expect(() => renderInlineContext(context)).not.toThrow()
  })
})
