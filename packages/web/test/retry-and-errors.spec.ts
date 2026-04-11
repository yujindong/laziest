import { describe, expect, it } from 'vitest'
import { ResourceManager, ResourcePreloadError } from '../src'

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

  it('does not retry a deterministic TypeError', async () => {
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
        attempt: 1,
      })
    }

    expect(attempts).toBe(1)
  })
})
