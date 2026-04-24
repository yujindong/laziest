import { normalizeResourcePlan } from './shared/types'
import type { ResourcePlan } from './shared/types'

export { ResourceManager } from './core/resource-manager'
export { ResourcePreloadError, ResourceRunError } from './core/errors'
export { normalizePlan, sortScheduledItems } from './core/plan'
export { ResourceRun, ResourceRuntime } from './core/resource-runtime'
export { buildPrioritySchedulingUnits } from './core/scheduler'
export { consoleResourceLogger, shouldLog } from './shared/logger'
export type * from './shared/types'

export function createResourcePlan(plan: ResourcePlan): ResourcePlan {
  return normalizeResourcePlan(plan)
}
