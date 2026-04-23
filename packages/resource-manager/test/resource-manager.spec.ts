import { describe, expect, it, vi } from 'vitest'
import {
  ResourceManager,
  ResourcePreloadError,
  consoleResourceLogger,
  shouldLog,
} from '../src'
import { deferred } from './helpers/deferred'

describe('ResourceManager', () => {
  it('registers the package test setup matcher before this suite', () => {
    expect('setup').toHaveResourceManagerTestSetup()
  })

  it('exports the public package api from the root entrypoint', () => {
    expect(ResourceManager).toBeTypeOf('function')
    expect(ResourcePreloadError).toBeTypeOf('function')
    expect(consoleResourceLogger).toBeTypeOf('object')
    expect(shouldLog).toBeTypeOf('function')
  })

  it('starts with an idle snapshot', () => {
    const manager = new ResourceManager()

    expect(manager.getSnapshot()).toMatchObject({
      status: 'idle',
      startedAt: null,
      endedAt: null,
      total: 0,
      queued: 0,
      loading: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      completed: 0,
      progress: 0,
      activeItems: [],
      recentlyCompleted: [],
      errors: [],
      warnings: [],
    })
  })

  it('returns cloned nested snapshot objects', () => {
    const manager = new ResourceManager()
    const internal = manager as unknown as {
      snapshot: ReturnType<ResourceManager['getSnapshot']>
    }

    internal.snapshot = {
      status: 'running',
      startedAt: 1,
      endedAt: null,
      total: 1,
      queued: 0,
      loading: 1,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      completed: 0,
      progress: 0,
      activeItems: [
        {
          id: 'item-1',
          url: '/hero.png',
          type: 'image',
          status: 'loading',
          attempt: 1,
          startedAt: 1,
          endedAt: null,
          duration: null,
          fromCache: false,
          transfer: { loadedBytes: 10, totalBytes: 100 },
        },
      ],
      recentlyCompleted: [
        {
          id: 'item-2',
          url: '/data.json',
          type: 'json',
          status: 'failed',
          attempt: 1,
          startedAt: 1,
          endedAt: 2,
          duration: 1,
          fromCache: false,
          error: {
            category: 'unknown',
            code: 'unknown',
            retriable: false,
            message: 'boom',
            cause: new Error('boom'),
            url: '/data.json',
            type: 'json',
            attempt: 1,
          },
        },
      ],
      errors: [
        {
          category: 'unknown',
          code: 'unknown',
          retriable: false,
          message: 'boom',
          cause: new Error('boom'),
          url: '/data.json',
          type: 'json',
          attempt: 1,
        },
      ],
      warnings: [
        {
          code: 'warn',
          message: 'watch this',
          url: '/data.json',
          type: 'json',
        },
      ],
    }

    const snapshot = manager.getSnapshot()
    snapshot.activeItems[0].transfer!.loadedBytes = 999
    snapshot.activeItems[0].status = 'succeeded'
    snapshot.recentlyCompleted[0].message = 'changed'
    snapshot.recentlyCompleted[0].error!.message = 'changed'
    snapshot.errors[0].message = 'changed'
    snapshot.warnings[0].message = 'changed'

    const nextSnapshot = manager.getSnapshot()

    expect(nextSnapshot.activeItems[0].transfer).toEqual({
      loadedBytes: 10,
      totalBytes: 100,
    })
    expect(nextSnapshot.activeItems[0].status).toBe('loading')
    expect(nextSnapshot.recentlyCompleted[0].message).toBeUndefined()
    expect(nextSnapshot.recentlyCompleted[0].error?.message).toBe('boom')
    expect(nextSnapshot.errors[0].message).toBe('boom')
    expect(nextSnapshot.warnings[0].message).toBe('watch this')
  })

  it('normalizes bucket inputs into the total count', async () => {
    const manager = new ResourceManager({
      loaders: {
        image: async () => undefined,
        json: async () => ({ ok: true }),
      },
    })

    await manager.preload({
      images: ['/a.png', { url: '/b.png', optional: true }],
      json: ['/data.json'],
    })

    expect(manager.getSnapshot()).toMatchObject({
      status: 'completed',
      total: 3,
      succeeded: 3,
      completed: 3,
    })
  })

  it('emits snapshot events and unsubscribes cleanly', async () => {
    const manager = new ResourceManager({
      loaders: {
        image: async () => undefined,
      },
    })

    const events: Array<{ type: string; snapshot: string; extra?: unknown }> = []
    const unsubscribe = manager.subscribe(({ event, snapshot }) => {
      switch (event.type) {
        case 'session-started':
          events.push({
            type: event.type,
            snapshot: snapshot.status,
            extra: { total: event.total, startedAt: event.startedAt },
          })
          break
        case 'item-started':
        case 'item-succeeded':
          events.push({
            type: event.type,
            snapshot: snapshot.status,
            extra: { id: event.item.id, url: event.item.url, status: event.item.status },
          })
          break
        case 'session-completed':
          events.push({
            type: event.type,
            snapshot: snapshot.status,
            extra: { status: event.result.status, total: event.result.total, succeeded: event.result.succeeded },
          })
          break
        default:
          events.push({ type: event.type, snapshot: snapshot.status })
      }
    })

    await manager.preload({ images: ['/hero.png'] })

    unsubscribe()

    await manager.preload({ images: ['/villain.png'] })

    expect(events).toHaveLength(4)
    expect(events[0]).toMatchObject({
      type: 'session-started',
      snapshot: 'running',
      extra: { total: 1 },
    })
    expect((events[0].extra as { startedAt: number }).startedAt).toEqual(
      expect.any(Number),
    )
    expect(events[1]).toMatchObject({
      type: 'item-started',
      snapshot: 'running',
      extra: {
        id: 'images:0',
        url: '/hero.png',
        status: 'loading',
      },
    })
    expect(events[2]).toMatchObject({
      type: 'item-succeeded',
      snapshot: 'running',
      extra: {
        id: 'images:0',
        url: '/hero.png',
        status: 'succeeded',
      },
    })
    expect(events[3]).toMatchObject({
      type: 'session-completed',
      snapshot: 'completed',
      extra: {
        status: 'completed',
        total: 1,
        succeeded: 1,
      },
    })
  })

  it('emits abort and reset lifecycle events while keeping subscribers attached', async () => {
    const gate = deferred<void>()
    const manager = new ResourceManager({
      loaders: {
        image: async () => {
          await gate.promise
        },
      },
    })

    const events: Array<{ type: string; snapshot: string; extra?: unknown }> = []
    manager.subscribe(({ event, snapshot }) => {
      switch (event.type) {
        case 'session-started':
          events.push({
            type: event.type,
            snapshot: snapshot.status,
            extra: { total: event.total },
          })
          break
        case 'item-started':
          events.push({
            type: event.type,
            snapshot: snapshot.status,
            extra: { id: event.item.id, status: event.item.status, url: event.item.url },
          })
          break
        case 'session-aborted':
          events.push({
            type: event.type,
            snapshot: snapshot.status,
            extra: { status: event.result.status, total: event.result.total, duration: event.result.duration },
          })
          break
        case 'session-reset':
          events.push({ type: event.type, snapshot: snapshot.status })
          break
        case 'item-succeeded':
          events.push({
            type: event.type,
            snapshot: snapshot.status,
            extra: { id: event.item.id, status: event.item.status, url: event.item.url },
          })
          break
        case 'session-completed':
          events.push({
            type: event.type,
            snapshot: snapshot.status,
            extra: { status: event.result.status },
          })
          break
        default:
          events.push({ type: event.type, snapshot: snapshot.status })
      }
    })

    const preload = manager.preload({ images: ['/hero.png'] })

    manager.abort()

    await expect(preload).rejects.toBeInstanceOf(ResourcePreloadError)
    expect(manager.getSnapshot()).toMatchObject({
      status: 'aborted',
      total: 1,
      loading: 0,
      activeItems: [],
    })
    expect(events[0]).toMatchObject({
      type: 'session-started',
      snapshot: 'running',
      extra: { total: 1 },
    })
    expect(events[1]).toMatchObject({
      type: 'item-started',
      snapshot: 'running',
      extra: {
        id: 'images:0',
        status: 'loading',
        url: '/hero.png',
      },
    })
    expect(events[2]).toMatchObject({
      type: 'session-aborted',
      snapshot: 'aborted',
      extra: {
        status: 'aborted',
        total: 1,
      },
    })
    expect((events[2].extra as { duration: number }).duration).toEqual(
      expect.any(Number),
    )

    gate.resolve()
    manager.reset()

    expect(manager.getSnapshot()).toMatchObject({
      status: 'idle',
      total: 0,
      loading: 0,
      activeItems: [],
    })

    await manager.preload({ images: ['/sidekick.png'] })

    expect(events).toHaveLength(8)
    expect(events[0]).toMatchObject({
      type: 'session-started',
      snapshot: 'running',
      extra: { total: 1 },
    })
    expect(events[1]).toMatchObject({
      type: 'item-started',
      snapshot: 'running',
      extra: {
        id: 'images:0',
        status: 'loading',
        url: '/hero.png',
      },
    })
    expect(events[2]).toMatchObject({
      type: 'session-aborted',
      snapshot: 'aborted',
      extra: { status: 'aborted', total: 1 },
    })
    expect(events[3]).toMatchObject({
      type: 'session-reset',
      snapshot: 'idle',
    })
    expect(events[4]).toMatchObject({
      type: 'session-started',
      snapshot: 'running',
      extra: { total: 1 },
    })
    expect(events[5]).toMatchObject({
      type: 'item-started',
      snapshot: 'running',
      extra: {
        id: 'images:0',
        status: 'loading',
        url: '/sidekick.png',
      },
    })
    expect(events[6]).toMatchObject({
      type: 'item-succeeded',
      snapshot: 'running',
      extra: {
        id: 'images:0',
        status: 'succeeded',
        url: '/sidekick.png',
      },
    })
    expect(events[7]).toMatchObject({
      type: 'session-completed',
      snapshot: 'completed',
      extra: { status: 'completed' },
    })

  })

  it('isolates subscriber payloads and terminal results from mutation', async () => {
    const manager = new ResourceManager({
      loaders: {
        image: async () => undefined,
      },
    })

    const laterSubscriberEvents: Array<{
      snapshotTotal: number
      resultTotal: number
      resultItemUrl: string
    }> = []

    manager.subscribe(({ event, snapshot }) => {
      if (event.type === 'session-completed') {
        snapshot.total = 99
        event.result.total = 99
        event.result.items[0].url = '/mutated.png'
      }
    })

    manager.subscribe(({ event, snapshot }) => {
      if (event.type === 'session-completed') {
        laterSubscriberEvents.push({
          snapshotTotal: snapshot.total,
          resultTotal: event.result.total,
          resultItemUrl: event.result.items[0].url,
        })
      }
    })

    const result = await manager.preload({ images: ['/hero.png'] })

    expect(result).toMatchObject({
      status: 'completed',
      total: 1,
      succeeded: 1,
    })
    expect(result.items[0].url).toBe('/hero.png')
    expect(laterSubscriberEvents).toEqual([
      {
        snapshotTotal: 1,
        resultTotal: 1,
        resultItemUrl: '/hero.png',
      },
    ])
  })

  it('keeps aborted session results isolated after reset and a later preload', async () => {
    const gate = deferred<void>()
    const manager = new ResourceManager({
      loaders: {
        image: async () => {
          await gate.promise
        },
      },
    })

    const first = manager.preload({ images: ['/hero.png'] })

    manager.abort()
    manager.reset()

    const second = manager.preload({ images: ['/sidekick.png'] })

    gate.resolve()

    await expect(first).rejects.toMatchObject({
      name: 'ResourcePreloadError',
      result: expect.objectContaining({
        status: 'aborted',
        total: 1,
        items: [],
        errors: [],
        warnings: [],
      }),
    })
    await expect(second).resolves.toMatchObject({
      status: 'completed',
      total: 1,
      succeeded: 1,
    })
  })

  it('reuses the active preload session while running', async () => {
    const gate = deferred<void>()
    const logger = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    }
    const manager = new ResourceManager({
      logLevel: 'info',
      logger,
      loaders: {
        image: async () => {
          await gate.promise
        },
      },
    })

    const first = manager.preload({ images: ['/hero.png'] })
    const second = manager.preload({ images: ['/hero.png'] })

    expect(first).toBe(second)
    expect(logger.info).toHaveBeenCalledWith(
      'Resource preload reused active session',
      expect.objectContaining({
        total: 1,
      }),
    )

    gate.resolve()
    await first
  })

  it('rejects a different preload request while a session is running', async () => {
    const gate = deferred<void>()
    const manager = new ResourceManager({
      loaders: {
        image: async () => {
          await gate.promise
        },
      },
    })

    const first = manager.preload({ images: ['/hero.png'] })
    const second = manager.preload({ images: ['/different.png'] })

    await expect(second).rejects.toThrow(
      'ResourceManager.preload() called with different resources while a session is already running',
    )

    gate.resolve()
    await first
  })

  it('never exceeds the configured concurrency window', async () => {
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()]
    let active = 0
    let maxActive = 0

    const manager = new ResourceManager({
      concurrency: 2,
      loaders: {
        image: async ({ url }) => {
          const index = Number(url.match(/(\d+)/)?.[1]) - 1
          active += 1
          maxActive = Math.max(maxActive, active)
          await gates[index].promise
          active -= 1
        },
      },
    })

    const pending = manager.preload({
      images: ['/1.png', '/2.png', '/3.png'],
    })

    gates[0].resolve()
    gates[1].resolve()
    gates[2].resolve()
    await pending

    expect(maxActive).toBe(2)
  })

  it('deduplicates repeated resources inside one active session', async () => {
    let calls = 0
    const gate = deferred<void>()
    const manager = new ResourceManager({
      loaders: {
        image: async () => {
          calls += 1
          await gate.promise
        },
      },
    })

    const pending = manager.preload({
      images: ['/hero.png', '/hero.png'],
    })

    gate.resolve()
    await pending

    expect(calls).toBe(1)
  })

  it('reuses successful resources on later preload calls', async () => {
    let calls = 0
    const manager = new ResourceManager({
      loaders: {
        image: async () => {
          calls += 1
        },
      },
    })

    await manager.preload({ images: ['/hero.png'] })
    await manager.preload({ images: ['/hero.png'] })

    expect(calls).toBe(1)
  })

  it('reloads a successful resource after reset when resetClearsCache is true', async () => {
    let calls = 0
    const manager = new ResourceManager({
      resetClearsCache: true,
      loaders: {
        image: async () => {
          calls += 1
        },
      },
    })

    await manager.preload({ images: ['/hero.png'] })
    manager.reset()
    await manager.preload({ images: ['/hero.png'] })

    expect(calls).toBe(2)
  })

  it('marks a loader failure in the snapshot', async () => {
    const manager = new ResourceManager({
      loaders: {
        json: async () => {
          throw new Error('boom')
        },
      },
    })

    try {
      await manager.preload({ json: ['/broken.json'] })
      throw new Error('expected preload to reject')
    } catch (error) {
      expect(error).toBeInstanceOf(ResourcePreloadError)
      expect((error as ResourcePreloadError).result).toMatchObject({
        status: 'failed',
        failed: 1,
      })
    }

    expect(manager.getSnapshot()).toMatchObject({
      status: 'failed',
      total: 1,
      failed: 1,
      completed: 1,
      recentlyCompleted: [
        {
          status: 'failed',
          url: '/broken.json',
        },
      ],
      errors: [
        {
          message: 'boom',
          url: '/broken.json',
          type: 'json',
        },
      ],
    })
  })

  it('filters logger calls by level', async () => {
    const logger = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    }

    const manager = new ResourceManager({
      logLevel: 'error',
      logger,
      loaders: {
        json: async () => {
          throw new Error('boom')
        },
      },
    })

    await expect(manager.preload({ json: ['/broken.json'] })).rejects.toBeInstanceOf(
      ResourcePreloadError,
    )

    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalled()
  })

  it('does not fail preload when the logger throws', async () => {
    const logger = {
      error: vi.fn(() => {
        throw new Error('logger failed')
      }),
      warn: vi.fn(() => {
        throw new Error('logger failed')
      }),
      info: vi.fn(() => {
        throw new Error('logger failed')
      }),
      debug: vi.fn(() => {
        throw new Error('logger failed')
      }),
    }

    const manager = new ResourceManager({
      logLevel: 'info',
      logger,
      loaders: {
        image: async () => undefined,
      },
    })

    await expect(manager.preload({ images: ['/hero.png'] })).resolves.toMatchObject({
      status: 'completed',
      total: 1,
      succeeded: 1,
    })
  })
})
