import { describe, expect, it } from 'vitest'
import { ResourceManager, ResourcePreloadError } from '../src'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

describe('ResourceManager', () => {
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

  it('reuses the active preload session while running', async () => {
    const gate = deferred<void>()
    const manager = new ResourceManager({
      loaders: {
        image: async () => {
          await gate.promise
        },
      },
    })

    const first = manager.preload({ images: ['/hero.png'] })
    const second = manager.preload({ images: ['/hero.png'] })

    expect(first).toBe(second)

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
})
