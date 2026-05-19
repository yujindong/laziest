type PlainObject = Record<string, unknown>

function isPlainObject(value: unknown): value is PlainObject {
  if (value === null || typeof value !== 'object') {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function serializeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (typeof value === 'symbol') {
    return String(value)
  }

  if (typeof value === 'function') {
    return `[Function ${value.name || 'anonymous'}]`
  }

  if (value === null || typeof value !== 'object') {
    return value
  }

  if (seen.has(value)) {
    return '[Circular]'
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }

  if (Array.isArray(value)) {
    seen.add(value)
    const serialized = value.map((item) => serializeValue(item, seen))
    seen.delete(value)
    return serialized
  }

  if (isPlainObject(value)) {
    seen.add(value)
    const serialized: PlainObject = {}

    for (const [key, item] of Object.entries(value)) {
      serialized[key] = serializeValue(item, seen)
    }

    seen.delete(value)
    return serialized
  }

  return String(value)
}

export function safeSerialize(value: unknown): unknown {
  return serializeValue(value, new WeakSet())
}

function renderInlineValue(value: unknown): string {
  if (typeof value === 'string') {
    return /\s/.test(value) ? JSON.stringify(value) : value
  }

  if (value === null || typeof value !== 'object') {
    return String(value)
  }

  return JSON.stringify(value)
}

export function renderInlineContext(context: unknown): string {
  const serialized = safeSerialize(context)

  if (!isPlainObject(serialized)) {
    return renderInlineValue(serialized)
  }

  return Object.entries(serialized)
    .map(([key, value]) => `${key}=${renderInlineValue(value)}`)
    .join(' ')
}
