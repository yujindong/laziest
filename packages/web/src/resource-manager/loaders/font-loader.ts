import { createAbortError } from './types'
import type { BrowserLoader } from './types'

function getFontFaceSource(item: Parameters<BrowserLoader>[0]): string {
  return `url(${JSON.stringify(item.url)})`
}

function waitForFontLoad(
  fontFace: FontFace,
  signal: AbortSignal,
): Promise<FontFace> {
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? createAbortError())
  }

  return new Promise<FontFace>((resolve, reject) => {
    const onAbort = () => {
      cleanup()
      reject(signal.reason ?? createAbortError())
    }

    const cleanup = () => {
      signal.removeEventListener('abort', onAbort)
    }

    signal.addEventListener('abort', onAbort, { once: true })

    fontFace.load().then(
      (loaded) => {
        cleanup()
        resolve(loaded)
      },
      (error) => {
        cleanup()
        reject(error)
      },
    )
  })
}

export const fontLoader: BrowserLoader = async (item, context) => {
  const fontFace = new FontFace(
    item.family ?? item.url,
    getFontFaceSource(item),
    item.descriptors,
  )

  const loaded = await waitForFontLoad(fontFace, context.signal)
  document.fonts.add(loaded)
  return loaded
}
