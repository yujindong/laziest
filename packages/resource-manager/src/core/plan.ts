import type {
  NormalizedGroup,
  NormalizedItem,
  ResourcePlan,
} from '../shared/types'

export function normalizePlan(plan: ResourcePlan): NormalizedGroup[] {
  return plan.groups.map((group, groupIndex) => ({
    key: group.key,
    priority: group.priority ?? 0,
    blocking: group.blocking ?? false,
    index: groupIndex,
    items: group.items.map((item, itemIndex): NormalizedItem => ({
      key: item.key ?? `${group.key}:${itemIndex}`,
      groupKey: group.key,
      url: item.url,
      type: item.type,
      optional: item.optional ?? false,
      priority: item.priority ?? 0,
      groupPriority: group.priority ?? 0,
      index: itemIndex,
      groupIndex,
      dedupeKey: `${item.type}:${item.url}`,
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
