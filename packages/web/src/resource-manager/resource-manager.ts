import type {
  ResourceManagerOptions,
  ResourceManagerSnapshot,
} from './types'

function createIdleSnapshot(): ResourceManagerSnapshot {
  return {
    status: 'idle',
    startedAt: null,
    endedAt: null,
    total: 0,
    queued: 0,
    loading: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    completed: 0,
    progress: 0,
    activeItems: [],
    recentlyCompleted: [],
    errors: [],
    warnings: [],
  }
}

export class ResourceManager {
  readonly options: ResourceManagerOptions
  private snapshot: ResourceManagerSnapshot

  constructor(options: ResourceManagerOptions = {}) {
    this.options = options
    this.snapshot = createIdleSnapshot()
  }

  getSnapshot(): ResourceManagerSnapshot {
    return {
      ...this.snapshot,
      activeItems: this.snapshot.activeItems.map((item) => ({
        ...item,
        transfer: item.transfer ? { ...item.transfer } : undefined,
        error: item.error ? { ...item.error } : undefined,
      })),
      recentlyCompleted: this.snapshot.recentlyCompleted.map((item) => ({
        ...item,
        transfer: item.transfer ? { ...item.transfer } : undefined,
        error: item.error ? { ...item.error } : undefined,
      })),
      errors: this.snapshot.errors.map((error) => ({ ...error })),
      warnings: this.snapshot.warnings.map((warning) => ({ ...warning })),
    }
  }
}
