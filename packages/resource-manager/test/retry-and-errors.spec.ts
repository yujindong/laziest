import { describe, expect, it, vi } from 'vitest'
import {
  ResourceManager,
  ResourcePreloadError,
  ResourceRunError,
  ResourceRuntime,
  createResourcePlan,
} from '../src'

describe('retry and error handling', () => {
  it('rejects on required 404 failures with structured error details', async () => {
    const manager = new ResourceManager({
      loaders: {
        json: async () => {
          throw new Response(null, { status: 404, statusText: 'Not Found' })
        },
      },
    })

    try {
      await manager.preload({ json: ['/missing.json'] })
      throw new Error('expected preload to reject')
    } catch (error) {
      expect(error).toBeInstanceOf(ResourcePreloadError)
      expect((error as ResourcePreloadError).result.errors[0]).toMatchObject({
        code: 'HTTP_404',
        attempt: 1,
      })
    }
  })

  it('marks optional failures as skipped with a warning', async () => {
    const manager = new ResourceManager({
      loaders: {
        image: async () => {
          throw new Response(null, { status: 404, statusText: 'Not Found' })
        },
      },
    })

    const result = await manager.preload({
      images: [{ url: '/optional.png', optional: true }],
    })

    expect(result).toMatchObject({
      status: 'completed',
      skipped: 1,
    })
    expect(result.warnings).toHaveLength(1)
  })

  it('retries transient failures before succeeding', async () => {
    let attempts = 0
    const manager = new ResourceManager({
      retry: { maxRetries: 2, delayMs: 0, backoff: 'fixed' },
      loaders: {
        json: async () => {
          attempts += 1
          if (attempts < 3) {
            throw new TypeError('Failed to fetch')
          }

          return { ok: true }
        },
      },
    })

    const result = await manager.preload({ json: ['/flaky.json'] })

    expect(result.succeeded).toBe(1)
    expect(attempts).toBe(3)
  })

  it('surfaces exhausted transient retries as a coherent failure', async () => {
    let attempts = 0
    const manager = new ResourceManager({
      retry: { maxRetries: 2, delayMs: 0, backoff: 'fixed' },
      loaders: {
        json: async () => {
          attempts += 1
          throw new TypeError('Failed to fetch')
        },
      },
    })

    try {
      await manager.preload({ json: ['/still-broken.json'] })
      throw new Error('expected preload to reject')
    } catch (error) {
      expect(error).toBeInstanceOf(ResourcePreloadError)
      expect((error as ResourcePreloadError).result).toMatchObject({
        status: 'failed',
        failed: 1,
      })
      expect((error as ResourcePreloadError).result.errors[0]).toMatchObject({
        code: 'NETWORK_ERROR',
        attempt: 3,
      })
    }

    expect(attempts).toBe(3)
  })

  it('retries a deterministic TypeError once when it is classified as unknown', async () => {
    let attempts = 0
    const manager = new ResourceManager({
      retry: { maxRetries: 2, delayMs: 0, backoff: 'fixed' },
      loaders: {
        json: async () => {
          attempts += 1
          throw new TypeError(
            "Cannot read properties of undefined (reading 'url')",
          )
        },
      },
    })

    try {
      await manager.preload({ json: ['/bad-input.json'] })
      throw new Error('expected preload to reject')
    } catch (error) {
      expect(error).toBeInstanceOf(ResourcePreloadError)
      expect((error as ResourcePreloadError).result.errors[0]).toMatchObject({
        code: 'unknown',
        attempt: 2,
      })
    }

    expect(attempts).toBe(2)
  })

  it('retries an unknown failure once by default', async () => {
    let attempts = 0
    const manager = new ResourceManager({
      retry: { delayMs: 0, backoff: 'fixed' },
      loaders: {
        json: async () => {
          attempts += 1
          if (attempts < 2) {
            throw new Error('mystery failure')
          }

          return { ok: true }
        },
      },
    })

    const result = await manager.preload({ json: ['/unknown.json'] })

    expect(result.succeeded).toBe(1)
    expect(attempts).toBe(2)
  })

  it('allows a custom retry policy to override the default unknown retry', async () => {
    let attempts = 0
    const manager = new ResourceManager({
      retry: {
        delayMs: 0,
        backoff: 'fixed',
        shouldRetry: () => false,
      },
      loaders: {
        json: async () => {
          attempts += 1
          throw new Error('mystery failure')
        },
      },
    })

    try {
      await manager.preload({ json: ['/custom-policy.json'] })
      throw new Error('expected preload to reject')
    } catch (error) {
      expect(error).toBeInstanceOf(ResourcePreloadError)
      expect((error as ResourcePreloadError).result.errors[0]).toMatchObject({
        code: 'unknown',
        attempt: 1,
      })
    }

    expect(attempts).toBe(1)
  })

  it('logs retry activity at info level', async () => {
    let attempts = 0
    const logger = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    }

    const manager = new ResourceManager({
      logLevel: 'info',
      logger,
      retry: { maxRetries: 1, delayMs: 0, backoff: 'fixed' },
      loaders: {
        json: async () => {
          attempts += 1
          if (attempts < 2) {
            throw new TypeError('Failed to fetch')
          }

          return { ok: true }
        },
      },
    })

    await manager.preload({ json: ['/retry-log.json'] })

    expect(logger.info).toHaveBeenCalledWith(
      'Resource item retrying',
      expect.objectContaining({
        attempt: 1,
        retryAfterMs: 0,
      }),
    )
  })

  it('rejects readiness and completion waiters when a blocking group fails', async () => {
    const runtime = new ResourceRuntime(
      createResourcePlan({
        groups: [
          {
            key: 'critical',
            blocking: true,
            items: [{ type: 'image', url: '/broken.png' }],
          },
        ],
      }),
      {
        loaders: {
          image: async () => {
            throw new Error('boom')
          },
        },
      },
    )

    const run = runtime.start()

    await expect(run.waitForReady()).rejects.toBeInstanceOf(ResourceRunError)
    await expect(run.waitForAll()).rejects.toBeInstanceOf(ResourceRunError)
    expect(run.getSnapshot()).toMatchObject({
      status: 'failed',
      errors: [{ code: 'unknown', attempt: 1 }],
    })
  })

  it('does not create an unhandled rejection when only waitForReady is observed', async () => {
    const runtime = new ResourceRuntime(
      createResourcePlan({
        groups: [
          {
            key: 'critical',
            blocking: true,
            items: [{ type: 'image', url: '/broken.png' }],
          },
        ],
      }),
      {
        loaders: {
          image: async () => {
            throw new Error('boom')
          },
        },
      },
    )

    const run = runtime.start()

    await expect(run.waitForReady()).rejects.toBeInstanceOf(ResourceRunError)
    await Promise.resolve()
    expect(run.getSnapshot().status).toBe('failed')
  })

  it('does not reject waitForReady when a non-blocking group fails', async () => {
    let releaseCritical!: () => void
    const criticalPending = new Promise<void>((resolve) => {
      releaseCritical = resolve
    })

    const runtime = new ResourceRuntime(
      createResourcePlan({
        groups: [
          {
            key: 'critical',
            blocking: true,
            items: [{ type: 'image', url: '/hero.png' }],
          },
          {
            key: 'background',
            blocking: false,
            items: [{ type: 'image', url: '/broken.png' }],
          },
        ],
      }),
      {
        loaders: {
          image: async (item) => {
            if (item.url === '/hero.png') {
              await criticalPending
              return
            }

            throw new Error('background failed')
          },
        },
      },
    )

    const run = runtime.start()
    releaseCritical()

    await expect(run.waitForReady()).resolves.toMatchObject({
      status: 'ready',
      readyAt: expect.any(Number),
    })

    const result = await run.waitForAll()
    expect(result).toMatchObject({
      status: 'completed',
      errors: [{ code: 'unknown', url: '/broken.png', attempt: 1 }],
    })
    expect(run.getSnapshot()).toMatchObject({
      status: 'completed',
      groups: [
        { key: 'critical', status: 'completed' },
        { key: 'background', status: 'failed' },
      ],
    })
  })
})
