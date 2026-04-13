import { createAbortError } from './types'
import { ResourceDecodeError } from './types'
import type { BrowserLoader } from './types'

type MediaKind = 'audio' | 'video'

function waitForMediaLoad(
  element: HTMLMediaElement,
  signal: AbortSignal,
): Promise<HTMLMediaElement> {
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? createAbortError())
  }

  return new Promise<HTMLMediaElement>((resolve, reject) => {
    const complete = () => {
      cleanup()
      resolve(element)
    }

    const fail = () => {
      cleanup()
      reject(
        new ResourceDecodeError(
          `Failed to load media ${element.currentSrc || element.src}`,
        ),
      )
    }

    const onAbort = () => {
      cleanup()
      element.src = ''
      reject(signal.reason ?? createAbortError())
    }

    const cleanup = () => {
      element.removeEventListener('loadedmetadata', complete)
      element.removeEventListener('loadeddata', complete)
      element.removeEventListener('canplaythrough', complete)
      element.removeEventListener('error', fail)
      signal.removeEventListener('abort', onAbort)
    }

    element.addEventListener('loadedmetadata', complete, { once: true })
    element.addEventListener('loadeddata', complete, { once: true })
    element.addEventListener('canplaythrough', complete, { once: true })
    element.addEventListener('error', fail, { once: true })
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function createMediaElement(kind: MediaKind): HTMLMediaElement {
  return document.createElement(kind) as HTMLMediaElement
}

function configureMediaElement(
  element: HTMLMediaElement,
  item: Parameters<BrowserLoader>[0],
): void {
  if (item.preload) {
    element.preload = item.preload
  }

  if (item.crossOrigin !== undefined) {
    element.crossOrigin = item.crossOrigin
  }

  element.src = item.url
  element.load()
}

function createMediaLoader(kind: MediaKind): BrowserLoader {
  return async (item, context) => {
    const element = createMediaElement(kind)
    const promise = waitForMediaLoad(element, context.signal)
    configureMediaElement(element, item)
    return await promise
  }
}

export const audioLoader = createMediaLoader('audio')
export const videoLoader = createMediaLoader('video')
