import type {
  DataResourceInput,
  FontResourceInput,
  ImageResourceInput,
  MediaResourceInput,
  NormalizedResourceItem,
  ResourceBuckets,
  ResourceLoaderKey,
  ResourceType,
} from '../shared/types'

type NormalizedSource = NormalizedResourceItem['source']

const REQUEST_INIT_KEY_FIELDS: Array<keyof RequestInit> = [
  'body',
  'cache',
  'credentials',
  'headers',
  'integrity',
  'keepalive',
  'method',
  'mode',
  'redirect',
  'referrer',
  'referrerPolicy',
  'signal',
  'window',
]

let unsafeRequestInitKeyCounter = 0

function normalizeSharedSource(
  input: string | { url: string; optional?: boolean },
): { url: string; optional?: boolean } {
  return typeof input === 'string' ? { url: input } : input
}

function createSharedItem(options: {
  bucket: 'images' | 'json' | 'text' | 'binary' | 'lottie' | 'audio' | 'video'
  type: ResourceType
  loaderKey: ResourceLoaderKey
  input: string | { url: string; optional?: boolean }
  index: number
}): NormalizedResourceItem {
  const source = normalizeSharedSource(options.input) as NormalizedSource

  return {
    id: `${options.bucket}:${options.index}`,
    bucket: options.bucket,
    type: options.type,
    loaderKey: options.loaderKey,
    url: source.url,
    optional: source.optional ?? false,
    dedupeKey: `${options.loaderKey}|${source.url}`,
    source,
  }
}

function createFontItem(
  input: FontResourceInput,
  index: number,
): NormalizedResourceItem {
  const source = input
  const descriptorKey = input.descriptors ? JSON.stringify(input.descriptors) : ''

  return {
    id: `fonts:${index}`,
    bucket: 'fonts',
    type: 'font',
    loaderKey: 'font',
    url: input.url,
    optional: input.optional ?? false,
    dedupeKey: `font|${input.family}|${input.url}|${descriptorKey}`,
    source,
    family: input.family,
    descriptors: input.descriptors,
  }
}

function createMediaItem(
  bucket: 'audio' | 'video',
  input: MediaResourceInput,
  index: number,
): NormalizedResourceItem {
  const normalized =
    typeof input === 'string'
      ? { url: input }
      : input
  const source = normalizeSharedSource(
    normalized as string | { url: string; optional?: boolean },
  ) as NormalizedSource
  const preload = typeof input === 'string' ? undefined : input.preload
  const crossOrigin =
    typeof input === 'string' ? undefined : input.crossOrigin

  return {
    id: `${bucket}:${index}`,
    bucket,
    type: bucket,
    loaderKey: bucket,
    url: source.url,
    optional: source.optional ?? false,
    dedupeKey: `${bucket}|${source.url}|${preload ?? ''}|${crossOrigin ?? ''}`,
    source,
    preload,
    crossOrigin,
  }
}

function createUnsafeRequestInitDedupeKey(
  bucket: 'json' | 'text' | 'binary' | 'lottie',
  index: number,
): string {
  unsafeRequestInitKeyCounter += 1
  return `${bucket}|unsafe-request-init|${index}|${unsafeRequestInitKeyCounter}`
}

function serializeHeaders(headers: RequestInit['headers']): string | null {
  if (!headers) {
    return ''
  }

  try {
    const entries: Array<[string, string]> = []

    if (headers instanceof Headers) {
      headers.forEach((value, key) => {
        entries.push([key.toLowerCase(), value])
      })
    } else if (Array.isArray(headers)) {
      for (const entry of headers) {
        if (!Array.isArray(entry) || entry.length !== 2) {
          return null
        }

        const [key, value] = entry
        if (typeof key !== 'string' || typeof value !== 'string') {
          return null
        }

        entries.push([key.toLowerCase(), value])
      }
    } else if (typeof headers === 'object') {
      for (const [key, value] of Object.entries(headers)) {
        if (typeof value !== 'string') {
          return null
        }

        entries.push([key.toLowerCase(), value])
      }
    } else {
      return null
    }

    entries.sort(([aKey, aValue], [bKey, bValue]) =>
      aKey === bKey ? aValue.localeCompare(bValue) : aKey.localeCompare(bKey),
    )

    return entries.map(([key, value]) => `${key}:${value}`).join('\u0001')
  } catch {
    return null
  }
}

function serializeBody(body: RequestInit['body']): string | null {
  if (body == null) {
    return ''
  }

  if (typeof body === 'string') {
    return `string:${body}`
  }

  if (body instanceof URLSearchParams) {
    return `urlsearchparams:${body.toString()}`
  }

  if (body instanceof ArrayBuffer) {
    return `arraybuffer:${Array.from(new Uint8Array(body)).join(',')}`
  }

  if (ArrayBuffer.isView(body)) {
    const view = new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
    return `${body.constructor.name.toLowerCase()}:${Array.from(view).join(',')}`
  }

  return null
}

function serializeRequestInit(requestInit: RequestInit): string | null {
  for (const key of Object.keys(requestInit)) {
    if (!REQUEST_INIT_KEY_FIELDS.includes(key as keyof RequestInit)) {
      return null
    }
  }

  const parts: string[] = []

  if (requestInit.method) {
    parts.push(`method:${requestInit.method.toUpperCase()}`)
  }
  if (requestInit.mode) {
    parts.push(`mode:${requestInit.mode}`)
  }
  if (requestInit.credentials) {
    parts.push(`credentials:${requestInit.credentials}`)
  }
  if (requestInit.cache) {
    parts.push(`cache:${requestInit.cache}`)
  }
  if (requestInit.redirect) {
    parts.push(`redirect:${requestInit.redirect}`)
  }
  if (requestInit.referrer) {
    parts.push(`referrer:${requestInit.referrer}`)
  }
  if (requestInit.referrerPolicy) {
    parts.push(`referrerPolicy:${requestInit.referrerPolicy}`)
  }
  if (requestInit.integrity) {
    parts.push(`integrity:${requestInit.integrity}`)
  }
  if (typeof requestInit.keepalive === 'boolean') {
    parts.push(`keepalive:${requestInit.keepalive}`)
  }
  const headersKey = serializeHeaders(requestInit.headers)
  if (headersKey === null) {
    return null
  }
  parts.push(`headers:${headersKey}`)

  const bodyKey = serializeBody(requestInit.body)
  if (bodyKey === null) {
    return null
  }
  parts.push(`body:${bodyKey}`)

  return parts.join('\u0000')
}

function createDataItem(
  bucket: 'json' | 'text' | 'binary' | 'lottie',
  input: DataResourceInput,
  index: number,
): NormalizedResourceItem {
  const source =
    typeof input === 'string' ? { url: input } : input

  return {
    id: `${bucket}:${index}`,
    bucket,
    type: bucket,
    loaderKey: bucket,
    url: source.url,
    optional: source.optional ?? false,
    dedupeKey: source.requestInit
      ? (() => {
          const requestInitKey = serializeRequestInit(source.requestInit)
          return requestInitKey
            ? `${bucket}|${source.url}|${requestInitKey}`
            : createUnsafeRequestInitDedupeKey(bucket, index)
        })()
      : `${bucket}|${source.url}`,
    source,
    requestInit: source.requestInit,
  }
}

export function normalizeResourceBuckets(
  buckets: ResourceBuckets = {},
): NormalizedResourceItem[] {
  const items: NormalizedResourceItem[] = []

  buckets.images?.forEach((input, index) => {
    items.push(
      createSharedItem({
        bucket: 'images',
        type: 'image',
        loaderKey: 'image',
        input: input as ImageResourceInput,
        index,
      }),
    )
  })

  buckets.fonts?.forEach((input, index) => {
    items.push(createFontItem(input, index))
  })

  buckets.audio?.forEach((input, index) => {
    items.push(createMediaItem('audio', input, index))
  })

  buckets.video?.forEach((input, index) => {
    items.push(createMediaItem('video', input, index))
  })

  buckets.lottie?.forEach((input, index) => {
    items.push(createDataItem('lottie', input, index))
  })

  buckets.json?.forEach((input, index) => {
    items.push(createDataItem('json', input, index))
  })

  buckets.text?.forEach((input, index) => {
    items.push(createDataItem('text', input, index))
  })

  buckets.binary?.forEach((input, index) => {
    items.push(createDataItem('binary', input, index))
  })

  return items
}

export function createNormalizedResourceSignature(
  items: NormalizedResourceItem[],
): string {
  return items.map((item) => item.dedupeKey).join('\u0000')
}
