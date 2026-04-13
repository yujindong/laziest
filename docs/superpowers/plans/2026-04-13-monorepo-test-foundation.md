# Monorepo Test Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a root-level unit test entrypoint for the monorepo, while standardizing `packages/web` as the first fully wired package with watch mode, setup files, and coverage support.

**Architecture:** The repository root owns developer-facing test commands and delegates to package scripts through `pnpm --filter`. Each package keeps its own Vitest config so environment, test discovery, setup hooks, and coverage behavior stay local to the package. `packages/web` is the reference package for this convention.

**Tech Stack:** `pnpm`, `Vitest`, `jsdom`, `@vitest/coverage-v8`, TypeScript

---

## File Structure

- Modify: `package.json`
  Responsibility: add root test aggregation scripts and the coverage provider dependency.
- Modify: `pnpm-lock.yaml`
  Responsibility: capture the dependency graph change from installing `@vitest/coverage-v8`.
- Modify: `packages/web/package.json`
  Responsibility: expose package-local watch and coverage scripts.
- Modify: `packages/web/vitest.config.ts`
  Responsibility: add a package-local setup hook and coverage configuration.
- Create: `packages/web/test/setup.ts`
  Responsibility: provide the stable package-level Vitest setup entrypoint.
- Modify: `packages/web/test/resource-manager.spec.ts`
  Responsibility: prove the setup file executes before tests and keep the setup contract observable.

### Task 1: Add Root Test Entry Points And Coverage Dependency

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Edit the root `package.json` to add monorepo test scripts and the coverage provider**

Replace the root manifest with the following content:

```json
{
  "name": "laziest",
  "private": true,
  "type": "module",
  "author": {
    "name": "于金冬(YuJindong)",
    "url": "https://www.yujindong.com",
    "email": "yujindong1985@gmail.com"
  },
  "scripts": {
    "changeset": "changeset",
    "changeset:status": "changeset status --verbose",
    "build:web": "pnpm --filter @laziest/web build",
    "test": "pnpm --filter @laziest/web test",
    "test:web": "pnpm --filter @laziest/web test",
    "test:watch": "pnpm --filter @laziest/web test:watch",
    "test:coverage": "pnpm --filter @laziest/web test:coverage",
    "version-packages": "changeset version",
    "release": "changeset publish"
  },
  "packageManager": "pnpm@10.33.0",
  "devDependencies": {
    "@changesets/cli": "^2.30.0",
    "@vitest/coverage-v8": "^3.2.4",
    "jsdom": "^26.1.0",
    "tsdown": "^0.21.7",
    "typescript": "^6.0.2",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Install dependencies so `pnpm-lock.yaml` captures the new coverage provider**

Run:

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` updates and the install output includes `@vitest/coverage-v8`.

- [ ] **Step 3: Verify the new root scripts resolve before touching package-level config**

Run:

```bash
pnpm run test --help
```

Expected: pnpm recognizes the root `test` script and prints script execution help instead of `Missing script: test`.

- [ ] **Step 4: Commit the root script and dependency changes**

Run:

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add monorepo test entrypoints"
```

Expected: a commit containing only the root manifest and lockfile changes.

### Task 2: Standardize `packages/web` Test Scripts, Setup, And Coverage

**Files:**
- Modify: `packages/web/package.json`
- Modify: `packages/web/vitest.config.ts`
- Create: `packages/web/test/setup.ts`
- Modify: `packages/web/test/resource-manager.spec.ts`

- [ ] **Step 1: Add the failing setup contract test to `packages/web/test/resource-manager.spec.ts`**

Insert this test near the top of the `describe('ResourceManager', ...)` block, before the existing API export test:

```ts
  it('loads the package test setup before spec execution', () => {
    const testGlobal = globalThis as typeof globalThis & {
      __LAZIEST_WEB_TEST_SETUP__?: boolean
    }

    expect(testGlobal.__LAZIEST_WEB_TEST_SETUP__).toBe(true)
  })
```

This should make the suite fail until `setupFiles` and the setup module are added.

- [ ] **Step 2: Run the targeted test to verify the new assertion fails for the expected reason**

Run:

```bash
pnpm --filter @laziest/web test -- test/resource-manager.spec.ts -t "loads the package test setup before spec execution"
```

Expected: FAIL with an assertion showing `expected undefined to be true` or equivalent, proving the setup hook is not wired yet.

- [ ] **Step 3: Update `packages/web/package.json` with watch and coverage scripts**

Replace the file with:

```json
{
  "name": "@laziest/web",
  "version": "0.0.0",
  "type": "module",
  "files": [
    "dist"
  ],
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.mts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.mts",
        "default": "./dist/index.mjs"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  },
  "scripts": {
    "build": "tsdown",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  }
}
```

- [ ] **Step 4: Update `packages/web/vitest.config.ts` to wire the setup file and coverage output**

Replace the config with:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    restoreMocks: true,
    clearMocks: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
    },
  },
});
```

- [ ] **Step 5: Create the package-local test setup entry at `packages/web/test/setup.ts`**

Create the file with:

```ts
const testGlobal = globalThis as typeof globalThis & {
  __LAZIEST_WEB_TEST_SETUP__?: boolean
}

testGlobal.__LAZIEST_WEB_TEST_SETUP__ = true
```

- [ ] **Step 6: Re-run the targeted setup contract test and verify it passes**

Run:

```bash
pnpm --filter @laziest/web test -- test/resource-manager.spec.ts -t "loads the package test setup before spec execution"
```

Expected: PASS for the targeted test.

- [ ] **Step 7: Run the full package test suite to verify no existing specs regressed**

Run:

```bash
pnpm --filter @laziest/web test
```

Expected: all existing `packages/web/test/*.spec.ts` files pass under the updated config.

- [ ] **Step 8: Commit the standardized `packages/web` test foundation**

Run:

```bash
git add packages/web/package.json packages/web/vitest.config.ts packages/web/test/setup.ts packages/web/test/resource-manager.spec.ts
git commit -m "test: standardize web package test setup"
```

Expected: a commit containing the package-local test script, config, setup, and assertion changes.

### Task 3: Verify Root Aggregation And Coverage Flow

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/web/package.json`
- Modify: `packages/web/vitest.config.ts`
- Create: `packages/web/test/setup.ts`
- Modify: `packages/web/test/resource-manager.spec.ts`

- [ ] **Step 1: Run the new root test entrypoint**

Run:

```bash
pnpm test
```

Expected: the command delegates to `@laziest/web` and the full package test suite passes.

- [ ] **Step 2: Run the new root coverage entrypoint**

Run:

```bash
pnpm test:coverage
```

Expected: coverage runs successfully through `@laziest/web`, prints a text summary in the terminal, and writes HTML output under `packages/web/coverage/`.

- [ ] **Step 3: Smoke-test the package-local watch script without leaving a hanging process**

Run:

```bash
pnpm --filter @laziest/web test:watch --run
```

Expected: Vitest accepts the watch script entry and completes a one-shot run successfully using the same config.

- [ ] **Step 4: Confirm the generated coverage directory is package-local**

Run:

```bash
ls packages/web/coverage
```

Expected: the directory exists and includes HTML coverage artifacts such as `index.html`.

- [ ] **Step 5: Commit the verified test foundation end state**

Run:

```bash
git add package.json pnpm-lock.yaml packages/web/package.json packages/web/vitest.config.ts packages/web/test/setup.ts packages/web/test/resource-manager.spec.ts
git commit -m "chore: verify monorepo test foundation"
```

Expected: if Tasks 1 and 2 were already committed separately, there should be no additional tracked source changes beyond deliberate verification artifacts. If `packages/web/coverage/` is not meant to be committed, leave it untracked and skip adding it.

## Self-Review

- Spec coverage check:
  - Root aggregation scripts are covered in Task 1 and verified in Task 3.
  - `packages/web` watch mode, setup file, and coverage support are covered in Task 2.
  - Package-local coverage output is verified in Task 3.
  - `examples/react` remains out of scope and is not assigned any work.
- Placeholder scan:
  - No `TBD`, `TODO`, or deferred implementation markers remain.
  - Each code-changing step includes exact replacement content.
- Type consistency:
  - The setup sentinel is consistently named `__LAZIEST_WEB_TEST_SETUP__` in both the setup module and the proving test.
  - Script names are consistently `test`, `test:watch`, and `test:coverage` at both root and package level.
