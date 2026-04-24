import { normalizeResourcePlan } from './shared/types'
import type { ResourcePlan } from './shared/types'

export { ResourceManager } from './core/resource-manager'
export { ResourcePreloadError } from './core/errors'
export { ResourceRun, ResourceRuntime } from './core/resource-runtime'
export { consoleResourceLogger, shouldLog } from './shared/logger'
export type * from './shared/types'

export function createResourcePlan(plan: ResourcePlan): ResourcePlan {
  return normalizeResourcePlan(plan)
}
