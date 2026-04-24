import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { ResourceManager, ResourceRuntime, createResourcePlan } from '../src'
import { createResourceFailure } from '../src/core/errors'
import { createLoaderRegistry } from '../src/loaders'
import { normalizeResourceBuckets } from '../src/core/normalize'
import {
  FakeFontFace,
  FakeImage,
  FakeMediaElement,
} from './helpers/fakes'

describe('built-in loaders', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    FakeFontFace.reset()
    FakeImage.reset()
    FakeMediaElement.reset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads json via fetch and parse', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"ok":true}', { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const loaders = createLoaderRegistry()
    const context = { signal: new AbortController().signal }

    await expect(
      loaders.json({ url: '/data.json' } as any, context),
    ).resolves.toEqual({ ok: true })

    expect(fetchMock).toHaveBeenCalledWith(
      '/data.json',
      expect.objectContaining({
        signal: context.signal,
      }),
    )
  })

  it.each([
    ['text', 'hello', 'hello'],
    ['binary', 'bytes', new TextEncoder().encode('bytes').buffer],
    ['lottie', '{"frames":2}', { frames: 2 }],
  ] as const)('loads %s via fetch', async (type, body, expected) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(body, { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const loaders = createLoaderRegistry()
    const context = { signal: new AbortController().signal }
    const result = await loaders[type]({
      url: '/asset',
    } as any, context)

    if (expected instanceof ArrayBuffer) {
      expect(result).toBeInstanceOf(ArrayBuffer)
      expect(Array.from(new Uint8Array(result as ArrayBuffer))).toEqual(
        Array.from(new Uint8Array(expected)),
      )
    } else {
      expect(result).toEqual(expected)
    }

    expect(fetchMock).toHaveBeenCalledWith(
      '/asset',
      expect.objectContaining({ signal: context.signal }),
    )
  })

  it('loads fonts through FontFace and document.fonts', async () => {
    const add = vi.fn()
    vi.stubGlobal('FontFace', FakeFontFace as unknown as typeof FontFace)
    Object.defineProperty(document, 'fonts', {
      value: { add },
      configurable: true,
    })

    const loaders = createLoaderRegistry()
    await loaders.font({
      family: 'Brand Sans',
      url: '/brand.woff2',
      descriptors: { style: 'normal', weight: '400' },
    } as any, { signal: new AbortController().signal })

    expect(add).toHaveBeenCalledTimes(1)
    expect(FakeFontFace.instances).toHaveLength(1)
    expect(FakeFontFace.instances[0]).toMatchObject({
      family: 'Brand Sans',
      source: 'url("/brand.woff2")',
      descriptors: { style: 'normal', weight: '400' },
      loadCalls: 1,
    })
  })

  it('quotes font urls safely for CSS-significant characters', async () => {
    const add = vi.fn()
    vi.stubGlobal('FontFace', FakeFontFace as unknown as typeof FontFace)
    Object.defineProperty(document, 'fonts', {
      value: { add },
      configurable: true,
    })

    const loaders = createLoaderRegistry()
    await loaders.font(
      {
        family: 'Brand Sans',
        url: '/fonts/brand)weird.woff2',
      } as any,
      { signal: new AbortController().signal },
    )

    expect(FakeFontFace.instances[0].source).toBe(
      'url("/fonts/brand)weird.woff2")',
    )
  })

  it('loads images through an Image element', async () => {
    vi.stubGlobal('Image', FakeImage as unknown as typeof Image)

    const loaders = createLoaderRegistry()
    const promise = loaders.image({
      url: '/hero.png',
    } as any, { signal: new AbortController().signal })

    expect(FakeImage.instances).toHaveLength(1)
    expect(FakeImage.instances[0].src).toBe('/hero.png')

    FakeImage.instances[0].triggerLoad()

    await expect(promise).resolves.toBeInstanceOf(FakeImage)
  })

  it('classifies image decode failures and supports aborts', async () => {
    vi.stubGlobal('Image', FakeImage as unknown as typeof Image)

    const loaders = createLoaderRegistry()
    const item = normalizeResourceBuckets({ images: ['/hero.png'] })[0]
    const controller = new AbortController()
    const promise = loaders.image(item as any, { signal: controller.signal })

    FakeImage.instances[0].triggerError()

    await expect(promise).rejects.toBeInstanceOf(Error)

    try {
      await promise
    } catch (error) {
      expect(createResourceFailure(item as any, error, 1)).toMatchObject({
        category: 'decode',
        code: 'DECODE_ERROR',
      })
    }

    const abortItem = normalizeResourceBuckets({ images: ['/abort.png'] })[0]
    const abortController = new AbortController()
    const abortPromise = loaders.image(abortItem as any, {
      signal: abortController.signal,
    })

    abortController.abort()

    await expect(abortPromise).rejects.toMatchObject({ name: 'AbortError' })
  })

  it.each(['audio', 'video'] as const)(
    'loads %s through a media element',
    async (kind) => {
      const originalCreateElement = document.createElement.bind(document)
      const createElement = vi
        .spyOn(document, 'createElement')
        .mockImplementation(((tagName: string) => {
          if (tagName === kind) {
            return new FakeMediaElement(kind) as unknown as HTMLElement
          }

          return originalCreateElement(tagName)
        }) as typeof document.createElement)

      const loaders = createLoaderRegistry()
      const promise = loaders[kind]({
        url: `/asset.${kind}`,
        preload: 'metadata',
        crossOrigin: 'anonymous',
      } as any, { signal: new AbortController().signal })

      expect(createElement).toHaveBeenCalledWith(kind)
      expect(FakeMediaElement.instances).toHaveLength(1)
      expect(FakeMediaElement.instances[0]).toMatchObject({
        tagName: kind,
        src: `/asset.${kind}`,
        preload: 'metadata',
        crossOrigin: 'anonymous',
        loadCalls: 1,
      })

      FakeMediaElement.instances[0].triggerLoadedMetadata()

      await expect(promise).resolves.toBe(FakeMediaElement.instances[0])
    },
  )

  it('classifies media decode failures', async () => {
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      if (tagName === 'video') {
        return new FakeMediaElement('video') as unknown as HTMLElement
      }

      return originalCreateElement(tagName)
    }) as typeof document.createElement)

    const loaders = createLoaderRegistry()
    const item = normalizeResourceBuckets({ video: ['/clip.mp4'] })[0]
    const promise = loaders.video(item as any, {
      signal: new AbortController().signal,
    })

    FakeMediaElement.instances[0].triggerError()

    await expect(promise).rejects.toBeInstanceOf(Error)

    try {
      await promise
    } catch (error) {
      expect(createResourceFailure(item as any, error, 1)).toMatchObject({
        category: 'decode',
        code: 'DECODE_ERROR',
      })
    }
  })

  it('classifies invalid json and lottie parse failures', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"broken":', { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const loaders = createLoaderRegistry()
    const jsonItem = normalizeResourceBuckets({ json: ['/data.json'] })[0]
    const lottieItem = normalizeResourceBuckets({ lottie: ['/anim.json'] })[0]

    await expect(
      loaders.json(jsonItem as any, { signal: new AbortController().signal }),
    ).rejects.toBeInstanceOf(Error)

    try {
      await loaders.lottie(lottieItem as any, {
        signal: new AbortController().signal,
      })
    } catch (error) {
      expect(createResourceFailure(lottieItem as any, error, 1)).toMatchObject({
        category: 'parse',
        code: 'PARSE_ERROR',
      })
    }
  })

  it('wires default loaders through ResourceManager', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"ok":true}', { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const manager = new ResourceManager()
    await expect(manager.preload({ json: ['/data.json'] })).resolves.toMatchObject({
      status: 'completed',
      total: 1,
      succeeded: 1,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('wires default loaders through ResourceRuntime', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"ok":true}', { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const runtime = new ResourceRuntime(
      createResourcePlan({
        groups: [
          {
            key: 'data',
            blocking: true,
            items: [{ type: 'json', url: '/data.json' }],
          },
        ],
      }),
    )

    await expect(runtime.start().waitForAll()).resolves.toMatchObject({
      status: 'completed',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('deduplicates data resources with equivalent Headers request init', async () => {
    let calls = 0
    const manager = new ResourceManager({
      loaders: {
        json: async () => {
          calls += 1
          return { ok: true }
        },
      },
    })

    const requestInitA = {
      method: 'POST',
      headers: new Headers([
        ['Accept', 'application/json'],
        ['X-Trace', 'alpha'],
      ]),
      body: JSON.stringify({ ok: true }),
    }
    const requestInitB = {
      method: 'POST',
      headers: new Headers([
        ['X-Trace', 'alpha'],
        ['Accept', 'application/json'],
      ]),
      body: JSON.stringify({ ok: true }),
    }

    await manager.preload({
      json: [
        { url: '/data.json', requestInit: requestInitA },
        { url: '/data.json', requestInit: requestInitB },
      ],
    })

    expect(calls).toBe(1)
  })

  it('emits item progress from streamed fetch-backed loaders', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"ok"'))
        controller.enqueue(encoder.encode(':true}'))
        controller.close()
      },
    })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: {
          'Content-Length': '11',
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const manager = new ResourceManager()
    const events: Array<{ type: string; loadedBytes?: number; totalBytes?: number }> =
      []

    manager.subscribe(({ event, snapshot }) => {
      if (event.type === 'item-progress') {
        events.push({
          type: event.type,
          loadedBytes: event.item.transfer?.loadedBytes,
          totalBytes: event.item.transfer?.totalBytes,
        })

        expect(snapshot.activeItems[0].transfer).toMatchObject({
          loadedBytes: expect.any(Number),
          totalBytes: 11,
        })
      }
    })

    await manager.preload({ json: ['/streamed.json'] })

    expect(events).not.toHaveLength(0)
    const lastEvent = events[events.length - 1]
    expect(lastEvent).toMatchObject({
      type: 'item-progress',
      totalBytes: 11,
    })
    expect(lastEvent?.loadedBytes).toBe(11)
  })
})
