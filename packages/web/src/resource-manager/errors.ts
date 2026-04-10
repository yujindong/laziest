import type { PreloadResult } from './types'

export class ResourcePreloadError extends Error {
  readonly result: PreloadResult

  constructor(message: string, result: PreloadResult) {
    super(message)
    this.name = 'ResourcePreloadError'
    this.result = result
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
