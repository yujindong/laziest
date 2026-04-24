import type { ResourceItem, ResourcePlan } from './shared/types'

export { ResourceManager } from './core/resource-manager'
export { ResourcePreloadError } from './core/errors'
export { ResourceRun, ResourceRuntime } from './core/resource-runtime'
export { consoleResourceLogger, shouldLog } from './shared/logger'
export type * from './shared/types'

function cloneResourceItem<T extends ResourceItem>(item: T): T {
  return { ...item }
}

function normalizeResourcePlan(plan: ResourcePlan): ResourcePlan {
  return {
    groups: plan.groups.map((group) => ({
      key: group.key,
      priority: group.priority ?? 0,
      blocking: group.blocking ?? false,
      items: group.items.map(cloneResourceItem),
    })),
  }
}

export function createResourcePlan(plan: ResourcePlan): ResourcePlan {
  return normalizeResourcePlan(plan)
}
