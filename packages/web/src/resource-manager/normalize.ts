import type {
  DataResourceInput,
  FontResourceInput,
  ImageResourceInput,
  MediaResourceInput,
  NormalizedResourceItem,
  ResourceBuckets,
  ResourceLoaderKey,
  ResourceType,
} from './types'

type NormalizedSource = NormalizedResourceItem['source']

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
    dedupeKey: `${bucket}|${source.url}|${source.requestInit ? JSON.stringify(source.requestInit) : ''}`,
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
