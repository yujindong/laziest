import { createRequestInit } from './types'
import { ResourceParseError } from './types'
import type { BrowserLoader } from './types'

function getTotalBytes(response: Response): number | undefined {
  const raw = response.headers.get('content-length')
  if (!raw) {
    return undefined
  }

  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const output = new Uint8Array(total)
  let offset = 0

  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }

  return output
}

async function readResponseBytes(
  response: Response,
  onProgress?: (transfer: { loadedBytes: number; totalBytes?: number }) => void,
): Promise<Uint8Array> {
  const totalBytes = getTotalBytes(response)
  const body = response.body

  if (!body || typeof body.getReader !== 'function') {
    const bytes = new Uint8Array(await response.arrayBuffer())
    onProgress?.({ loadedBytes: bytes.byteLength, totalBytes })
    return bytes
  }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let loadedBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      if (value) {
        chunks.push(value)
        loadedBytes += value.byteLength
        onProgress?.({ loadedBytes, totalBytes })
      }
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = concatChunks(chunks)
  if (loadedBytes === 0) {
    onProgress?.({ loadedBytes: 0, totalBytes })
  }

  return bytes
}

async function loadResponseBody(
  response: Response,
  kind: 'json' | 'text' | 'binary' | 'lottie',
  onProgress?: (transfer: { loadedBytes: number; totalBytes?: number }) => void,
): Promise<unknown> {
  const bytes = await readResponseBytes(response, onProgress)
  const decoder = new TextDecoder()

  switch (kind) {
    case 'json':
      try {
        return JSON.parse(decoder.decode(bytes))
      } catch {
        throw new ResourceParseError(
          `Failed to parse JSON from ${response.url || 'response'}`,
        )
      }
    case 'lottie':
      try {
        return JSON.parse(decoder.decode(bytes))
      } catch {
        throw new ResourceParseError(
          `Failed to parse Lottie payload from ${response.url || 'response'}`,
        )
      }
    case 'text':
      return decoder.decode(bytes)
    case 'binary':
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  }
}

function createFetchLoader(kind: 'json' | 'text' | 'binary' | 'lottie'): BrowserLoader {
  return async (item, context) => {
    const response = await fetch(item.url, createRequestInit(item, context.signal))

    if (!response.ok) {
      throw response
    }

    return await loadResponseBody(response, kind, context.onProgress)
  }
}

export const jsonLoader = createFetchLoader('json')
export const textLoader = createFetchLoader('text')
export const binaryLoader = createFetchLoader('binary')
export const lottieLoader = createFetchLoader('lottie')
