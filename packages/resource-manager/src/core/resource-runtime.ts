import type {
  ResourcePlan,
  ResourceRuntimeOptions,
} from '../shared/types'
import { normalizeResourcePlan } from '../shared/types'

export class ResourceRun {
  constructor(
    readonly plan: ResourcePlan,
    readonly options: ResourceRuntimeOptions = {},
  ) {}
}

export class ResourceRuntime {
  readonly plan: ResourcePlan
  readonly options: ResourceRuntimeOptions

  constructor(
    plan: ResourcePlan,
    options: ResourceRuntimeOptions = {},
  ) {
    this.plan = normalizeResourcePlan(plan)
    this.options = options
  }

  start(): ResourceRun {
    return new ResourceRun(this.plan, this.options)
  }
}
