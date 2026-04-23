import { expect } from 'vitest'

declare module 'vitest' {
  interface Assertion<T = any> {
    toHaveResourceManagerTestSetup(): void
  }
}

expect.extend({
  toHaveResourceManagerTestSetup() {
    return {
      pass: true,
      message: () =>
        'expected resource-manager test setup matcher to be registered',
    }
  },
})

export {}
