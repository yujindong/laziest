import type { NormalizedItem, ResourceCache } from '../shared/types'

export function createCacheKey(item: NormalizedItem): string {
  return `${item.type}:${item.url}`
}

export async function resolveCachedValue(
  cache: ResourceCache | undefined,
  item: NormalizedItem,
): Promise<unknown | undefined> {
  if (!cache) {
    return undefined
  }

  return await cache.get(createCacheKey(item))
}

export async function writeCacheValue(
  cache: ResourceCache | undefined,
  item: NormalizedItem,
  value: unknown,
): Promise<void> {
  if (!cache) {
    return
  }

  await cache.set(createCacheKey(item), value)
}
