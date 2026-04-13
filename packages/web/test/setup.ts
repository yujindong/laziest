import { expect } from 'vitest'

declare module 'vitest' {
  interface Assertion<T = any> {
    toHaveWebTestSetup(): void
  }
}

expect.extend({
  toHaveWebTestSetup() {
    return {
      pass: true,
      message: () => 'expected web test setup matcher to be registered',
    }
  },
})

export {}
