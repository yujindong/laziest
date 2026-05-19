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

  it('emits enabled log records with metadata and filters debug under info', () => {
    const transport = vi.fn()
    const context = { requestId: 'req-1' }
    const logger = createLogger({
      level: 'info',
      name: 'app',
      transports: [transport],
    })

    logger.debug('hidden')
    logger.info('ready', context)

    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport).toHaveBeenCalledWith({
      time: expect.any(Date),
      level: 'info',
      name: 'app',
      scope: [],
      message: 'ready',
      context,
    })
  })

  it('dispatches enabled records to object transports', () => {
    const transport = { log: vi.fn() }
    const logger = createLogger({ level: 'warn', transports: [transport] })

    logger.warn('retrying')

    expect(transport.log).toHaveBeenCalledWith({
      time: expect.any(Date),
      level: 'warn',
      scope: [],
      message: 'retrying',
      context: undefined,
    })
  })

  it('reports whether levels are enabled', () => {
    const logger = createLogger({ level: 'info' })

    expect(logger.isEnabled('error')).toBe(true)
    expect(logger.isEnabled('info')).toBe(true)
    expect(logger.isEnabled('debug')).toBe(false)
    expect(logger.isEnabled('trace')).toBe(false)
  })

  it('appends child scopes', () => {
    const transport = vi.fn()
    const logger = createLogger({ level: 'debug', transports: [transport] })

    logger.child('loader').child('image').debug('loaded')

    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'debug',
        scope: ['loader', 'image'],
        message: 'loaded',
      }),
    )
  })

  it('isolates the configured transports array from later mutation', () => {
    const firstTransport = vi.fn()
    const laterTransport = vi.fn()
    const transports: LogTransportLike[] = [firstTransport]
    const logger = createLogger({ level: 'info', transports })

    transports.push(laterTransport)
    logger.info('ready')

    expect(firstTransport).toHaveBeenCalledTimes(1)
    expect(laterTransport).not.toHaveBeenCalled()
  })

  it('isolates child scope arrays from parent and sibling records', () => {
    const records: Readonly<LogRecord>[] = []
    const logger = createLogger({ level: 'debug', transports: [(record) => records.push(record)] })
    const loaderLogger = logger.child('loader')
    const imageLogger = loaderLogger.child('image')
    const scriptLogger = loaderLogger.child('script')

    logger.debug('root')
    imageLogger.debug('image loaded')
    ;(records[1]?.scope as string[] | undefined)?.push('mutated')
    scriptLogger.debug('script loaded')
    imageLogger.debug('image loaded again')

    expect(records.map((record) => record.scope)).toEqual([
      [],
      ['loader', 'image', 'mutated'],
      ['loader', 'script'],
      ['loader', 'image'],
    ])
  })

  it('allows child loggers to override level', () => {
    const transport = vi.fn()
    const logger = createLogger({ level: 'info', transports: [transport] })

    logger.debug('hidden')
    logger.child('loader', { level: 'debug' }).debug('shown')

    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'debug',
        scope: ['loader'],
        message: 'shown',
      }),
    )
  })

  it('inherits name and transport error handling in child loggers', () => {
    const error = new Error('transport failed')
    const throwingTransport = vi.fn(() => {
      throw error
    })
    const onTransportError = vi.fn()
    const logger = createLogger({
      level: 'error',
      name: 'app',
      transports: [throwingTransport],
      onTransportError,
    })

    logger.child('loader').error('failed')

    const record = onTransportError.mock.calls[0]?.[1] as Readonly<LogRecord> | undefined
    expect(record).toEqual({
      time: expect.any(Date),
      level: 'error',
      name: 'app',
      scope: ['loader'],
      message: 'failed',
      context: undefined,
    })
    expect(onTransportError).toHaveBeenCalledWith(
      error,
      record,
      throwingTransport,
    )
  })

  it('isolates throwing transports and reports transport errors', () => {
    const error = new Error('transport failed')
    const records: Readonly<LogRecord>[] = []
    const throwingTransport = vi.fn((record: Readonly<LogRecord>) => {
      records.push(record)
      throw error
    })
    const laterTransport = vi.fn()
    const onTransportError = vi.fn()
    const logger = createLogger({
      level: 'error',
      transports: [throwingTransport, laterTransport],
      onTransportError,
    })

    logger.error('failed')

    const [record] = records
    expect(laterTransport).toHaveBeenCalledWith(record)
    expect(onTransportError).toHaveBeenCalledWith(
      error,
      record,
      throwingTransport,
    )
  })

  it('swallows onTransportError failures', () => {
    const throwingTransport: LogTransportLike = () => {
      throw new Error('transport failed')
    }
    const onTransportError = vi.fn(() => {
      throw new Error('handler failed')
    })
    const logger = createLogger({
      level: 'error',
      transports: [throwingTransport],
      onTransportError,
    })

    expect(() => logger.error('failed')).not.toThrow()
    expect(onTransportError).toHaveBeenCalledTimes(1)
  })
})
