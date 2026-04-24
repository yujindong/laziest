import type {
  ResourcePlan,
  ResourceRuntimeOptions,
} from '../shared/types'

class ResourceRun {
  constructor(
    readonly plan: ResourcePlan,
    readonly options: ResourceRuntimeOptions = {},
  ) {}
}

export class ResourceRuntime {
  constructor(
    readonly plan: ResourcePlan,
    readonly options: ResourceRuntimeOptions = {},
  ) {}

  start(): ResourceRun {
    return new ResourceRun(this.plan, this.options)
  }
}
