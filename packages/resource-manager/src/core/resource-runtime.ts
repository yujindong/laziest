import type {
  ResourceItem,
  ResourcePlan,
  ResourceRuntimeOptions,
} from '../shared/types'

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
