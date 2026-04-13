import { createAbortError } from './types'
import { ResourceDecodeError } from './types'
import type { BrowserLoader } from './types'

function waitForImageLoad(image: HTMLImageElement, signal: AbortSignal): Promise<HTMLImageElement> {
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? createAbortError())
  }

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const onLoad = () => {
      cleanup()
      resolve(image)
    }

    const onError = () => {
      cleanup()
      reject(new ResourceDecodeError(`Failed to load image ${image.src}`))
    }

    const onAbort = () => {
      cleanup()
      image.src = ''
      reject(signal.reason ?? createAbortError())
    }

    const cleanup = () => {
      image.removeEventListener('load', onLoad)
      image.removeEventListener('error', onError)
      signal.removeEventListener('abort', onAbort)
    }

    image.addEventListener('load', onLoad, { once: true })
    image.addEventListener('error', onError, { once: true })
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export const imageLoader: BrowserLoader = async (item, context) => {
  const image = new Image()
  const promise = waitForImageLoad(image, context.signal)
  image.src = item.url
  return await promise
}
