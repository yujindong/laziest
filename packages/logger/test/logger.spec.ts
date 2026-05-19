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
