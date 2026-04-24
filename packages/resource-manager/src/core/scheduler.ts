import { sortScheduledItems } from './plan'
import type {
  NormalizedGroup,
  PrioritySchedulingUnit,
} from '../shared/types'

export function buildPrioritySchedulingUnits(
  groups: NormalizedGroup[],
): PrioritySchedulingUnit[] {
  const blockingByGroupKey = new Map(
    groups.map((group) => [group.key, group.blocking] as const),
  )

  return sortScheduledItems(groups).map((item) => ({
    item,
    blocking: blockingByGroupKey.get(item.groupKey) ?? false,
  }))
}
