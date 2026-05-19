type PlainObject = Record<string, unknown>

function isPlainObject(value: unknown): value is PlainObject {
  if (value === null || typeof value !== 'object') {
    return false
  }

  let prototype: object | null

  try {
    prototype = Object.getPrototypeOf(value)
  } catch {
    return false
  }

  return prototype === Object.prototype || prototype === null
}

function stringifyUnknownObject(value: object): string {
  try {
    return String(value)
  } catch {
    try {
      return Object.prototype.toString.call(value)
    } catch {
      return '[Unserializable]'
    }
  }
}

function isError(value: object): value is Error {
  try {
    return value instanceof Error
  } catch {
    return false
  }
}

function readProperty(value: object, key: PropertyKey): unknown {
  try {
    return Reflect.get(value, key)
  } catch (error) {
    return thrownPlaceholder(error)
  }
}

function thrownPlaceholder(error: unknown): string {
  if (error === null || typeof error !== 'object' || !isError(error)) {
    return '[Thrown]'
  }

  try {
    return error.message ? `[Thrown: ${error.message}]` : '[Thrown]'
  } catch {
    return '[Thrown]'
  }
}

function serializeEnumerableProperties(value: object, seen: WeakSet<object>): PlainObject | string {
  const serialized: PlainObject = {}
  let descriptors: PropertyDescriptorMap

  try {
    descriptors = Object.getOwnPropertyDescriptors(value)
  } catch (error) {
    return thrownPlaceholder(error)
  }

  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable) {
      continue
    }

    if ('value' in descriptor) {
      serialized[key] = serializeValue(descriptor.value, seen)
      continue
    }

    if (descriptor.get) {
      try {
        serialized[key] = serializeValue(descriptor.get.call(value), seen)
      } catch (error) {
        serialized[key] = thrownPlaceholder(error)
      }
    }
  }

  return serialized
}

function serializeArray(value: readonly unknown[], seen: WeakSet<object>): unknown[] {
  seen.add(value)

  const length = readProperty(value, 'length')
  const serializedLength = typeof length === 'number' && Number.isSafeInteger(length) ? length : 0
  const serialized = new Array<unknown>(serializedLength)

  for (let index = 0; index < serializedLength; index += 1) {
    serialized[index] = serializeValue(readProperty(value, index), seen)
  }

  seen.delete(value)
  return serialized
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

  if (isError(value)) {
    seen.add(value)

    const serialized: PlainObject = {
      name: readProperty(value, 'name'),
      message: readProperty(value, 'message'),
      stack: readProperty(value, 'stack'),
    }
    const fields = serializeEnumerableProperties(value, seen)

    if (typeof fields === 'string') {
      serialized.fields = fields
    } else {
      Object.assign(serialized, fields)
    }

    seen.delete(value)
    return serialized
  }

  if (Array.isArray(value)) {
    return serializeArray(value, seen)
  }

  if (isPlainObject(value)) {
    seen.add(value)
    const serialized = serializeEnumerableProperties(value, seen)
    seen.delete(value)
    return serialized
  }

  return stringifyUnknownObject(value)
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
