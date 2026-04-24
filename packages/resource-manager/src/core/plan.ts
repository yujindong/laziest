import type {
  NormalizedGroup,
  NormalizedItem,
  ResourceItem,
  ResourcePlan,
} from '../shared/types'

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

function createUnsafeRequestInitDedupeKey(
  type: 'json' | 'text' | 'binary' | 'lottie',
  groupKey: string,
  itemIndex: number,
): string {
  unsafeRequestInitKeyCounter += 1
  return `${type}:${groupKey}:${itemIndex}:unsafe-request-init:${unsafeRequestInitKeyCounter}`
}

function createItemDedupeKey(
  groupKey: string,
  item: ResourceItem,
  itemIndex: number,
): string {
  switch (item.type) {
    case 'font': {
      const descriptorKey = item.descriptors ? JSON.stringify(item.descriptors) : ''
      return `font:${item.family}:${item.url}:${descriptorKey}`
    }
    case 'audio':
    case 'video':
      return `${item.type}:${item.url}:${item.preload ?? ''}:${item.crossOrigin ?? ''}`
    case 'json':
    case 'text':
    case 'binary':
    case 'lottie':
      if (!item.requestInit) {
        return `${item.type}:${item.url}`
      }

      {
        const requestInitKey = serializeRequestInit(item.requestInit)
        return requestInitKey
          ? `${item.type}:${item.url}:${requestInitKey}`
          : createUnsafeRequestInitDedupeKey(item.type, groupKey, itemIndex)
      }
    case 'image':
      return `image:${item.url}`
  }
}

export function normalizePlan(plan: ResourcePlan): NormalizedGroup[] {
  return plan.groups.map((group, groupIndex) => ({
    key: group.key,
    priority: group.priority ?? 0,
    blocking: group.blocking ?? false,
    index: groupIndex,
    items: group.items.map((item, itemIndex): NormalizedItem => ({
      ...item,
      key: item.key ?? `${group.key}:${itemIndex}`,
      groupKey: group.key,
      optional: item.optional ?? false,
      priority: item.priority ?? 0,
      groupPriority: group.priority ?? 0,
      index: itemIndex,
      groupIndex,
      dedupeKey: createItemDedupeKey(group.key, item, itemIndex),
    })),
  }))
}

export function sortScheduledItems(groups: NormalizedGroup[]): NormalizedItem[] {
  return groups
    .flatMap((group) => group.items)
    .sort((left, right) => {
      if (right.groupPriority !== left.groupPriority) {
        return right.groupPriority - left.groupPriority
      }

      if (right.priority !== left.priority) {
        return right.priority - left.priority
      }

      if (left.groupIndex !== right.groupIndex) {
        return left.groupIndex - right.groupIndex
      }

      return left.index - right.index
    })
}
