import { createRequestInit } from './types'
import { ResourceParseError } from './types'
import type { BrowserLoader } from './types'

async function loadResponseBody(
  response: Response,
  kind: 'json' | 'text' | 'binary' | 'lottie',
): Promise<unknown> {
  switch (kind) {
    case 'json':
    case 'lottie':
      try {
        return await response.json()
      } catch {
        throw new ResourceParseError(
          kind === 'json'
            ? `Failed to parse JSON from ${response.url || 'response'}`
            : `Failed to parse Lottie payload from ${response.url || 'response'}`,
        )
      }
    case 'text':
      return await response.text()
    case 'binary':
      return await response.arrayBuffer()
  }
}

function createFetchLoader(kind: 'json' | 'text' | 'binary' | 'lottie'): BrowserLoader {
  return async (item, context) => {
    const response = await fetch(item.url, createRequestInit(item, context.signal))

    if (!response.ok) {
      throw response
    }

    return await loadResponseBody(response, kind)
  }
}

export const jsonLoader = createFetchLoader('json')
export const textLoader = createFetchLoader('text')
export const binaryLoader = createFetchLoader('binary')
export const lottieLoader = createFetchLoader('lottie')
