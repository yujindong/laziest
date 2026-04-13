# Monorepo Test Foundation Design

## Summary

Add a monorepo-level unit test foundation for the current workspace by introducing root test scripts while keeping test framework configuration owned by each package.

This work does not create a workspace-wide Vitest config. It standardizes how tests are run from the repository root, and uses `packages/web` as the first package that fully exposes the expected testing shape.

## Current State

The repository already contains part of the required testing setup:

- Root `package.json` already depends on `vitest` and `jsdom`.
- `packages/web` already contains `vitest.config.ts`.
- `packages/web` already contains package-local tests under `packages/web/test/`.
- Root `package.json` already exposes `test:web`, but there is no general root-level `test` entry for the workspace.

Because of this, the problem is not "add tests from scratch." The problem is to define a clear monorepo testing entrypoint and complete the package-level conventions that future packages can follow.

## Goals

- Add root-level scripts that act as the standard test entrypoint for the monorepo.
- Keep test configuration local to each package rather than centralizing it in a workspace config.
- Make `packages/web` the reference implementation for package-level unit test setup.
- Add standard package-level support for watch mode, setup files, and coverage reporting.
- Preserve a low-friction path for future packages to opt into the same testing shape.

## Non-Goals

- Adding a root-level `vitest.workspace.ts`.
- Merging coverage across multiple packages.
- Fully integrating `examples/react` into unit testing in this change.
- Adding CI-specific scripts or pipeline configuration in this change.
- Refactoring existing tests unless required to fit the new conventions.

## Design Decision

The repository will use root aggregation scripts plus package-local Vitest configuration.

That means:

- The root package decides how developers invoke tests across the repository.
- Each package decides how its own tests are discovered and configured.
- A package is considered "test-enabled" when it provides the expected package scripts and local Vitest config.

This matches the current repository structure, keeps configuration ownership close to the code under test, and avoids introducing workspace-level abstraction before multiple packages actually need it.

## Monorepo Responsibility Boundary

### Root Responsibilities

The root `package.json` owns the developer-facing commands for running tests across the repository.

It should provide:

- `test` for running all currently opted-in package tests
- `test:watch` for watch-mode execution during development
- `test:coverage` for package-driven coverage execution

These commands should aggregate through `pnpm --filter` rather than directly invoking Vitest from the repository root.

### Package Responsibilities

Each package that opts into unit testing owns:

- its own `test` scripts,
- its own `vitest.config.ts`,
- its own test file discovery pattern,
- its own `setup` file,
- its own coverage output behavior.

This keeps package behavior isolated and allows future packages to choose the correct environment, such as `node` or `jsdom`, without affecting other packages.

## `packages/web` Reference Shape

`packages/web` becomes the first package that fully conforms to the monorepo testing convention.

It should expose:

- `test`
- `test:watch`
- `test:coverage`

Its `vitest.config.ts` should:

- continue using `jsdom`,
- continue limiting test discovery to package-local test files,
- define `setupFiles`,
- define package-local coverage behavior and output.

Its test directory should include:

- a stable `test/setup.ts` entry,
- the existing package-local spec files,
- any small support helpers already used by tests.

## File-Level Design

### Root `package.json`

Modify root scripts so the workspace has a standard test entrypoint.

Expected additions:

- `test`
- `test:watch`
- `test:coverage`

These scripts should target `@laziest/web` first. Future packages can be added to the root aggregation script when they become test-enabled.

### `packages/web/package.json`

Keep the existing package-local `test` script and add:

- `test:watch`
- `test:coverage`

The package remains responsible for invoking Vitest with the correct mode and flags.

### `packages/web/vitest.config.ts`

Retain the package-local config file and extend it rather than replacing it.

Required changes:

- add `setupFiles` pointing to `./test/setup.ts`,
- keep the package-local `include` pattern,
- add coverage configuration with package-local output.

Coverage output should stay inside `packages/web/coverage/` so package artifacts remain self-contained.

### `packages/web/test/setup.ts`

Add a package-local setup entry even if it starts nearly empty.

Its purpose is to provide the standard extension point for:

- custom matchers,
- mocks,
- polyfills,
- shared cleanup or environment preparation.

The file can be intentionally minimal at first, but it should exist so future work does not require reshaping the package test contract again.

## Testing Conventions

The initial convention remains package-local test discovery:

- `packages/web/test/**/*.spec.ts`

This avoids accidental cross-package discovery and keeps each package free to choose its own environment and helper strategy.

The root command does not discover test files itself. It only delegates to packages that have opted in.

## Coverage Design

Coverage is package-driven, not workspace-merged.

The first implementation should support:

- running coverage from the root through package scripts,
- generating package-local coverage output,
- showing text coverage summary in the terminal.

This is enough to establish the workflow without prematurely solving multi-package report merging.

## Example App Position

`examples/react` is intentionally out of scope for direct test integration in this change.

Reasoning:

- it currently does not expose test scripts,
- the chosen design explicitly avoids forcing all workspace members into one Vitest shape,
- the immediate need is to define the convention using the library package that already has tests.

The example app can adopt the same pattern later when it has a clear need for unit tests.

## Migration and Expansion Rules

When another package is ready to join the monorepo test foundation, it should:

1. Add its own package-local `vitest.config.ts`.
2. Add `test`, `test:watch`, and `test:coverage` scripts.
3. Add a package-local `test/setup.ts`.
4. Add at least one real test proving the setup works.
5. Extend the root aggregation scripts to include that package.

This preserves a simple rule: packages opt in explicitly rather than being auto-discovered by the root.

## Verification Plan

The implementation should be considered complete when the following commands work from the repository root:

- `pnpm test`
- `pnpm test:coverage`
- `pnpm --filter @laziest/web test`

And when the following package-level capability exists:

- `@laziest/web` can run watch mode through its own script.

## Risks and Trade-Offs

### Accepted Trade-Off: No Shared Workspace Config

This means package configs may repeat some Vitest options over time.

That duplication is acceptable now because:

- only one package is test-enabled in the standardized way,
- package-local ownership is clearer than premature abstraction,
- different packages may legitimately need different test environments.

### Accepted Trade-Off: No Merged Coverage

Coverage reports will not represent the whole monorepo in a single artifact.

That is acceptable because the goal of this change is standardization of invocation and package shape, not coverage analytics across multiple packages.

## Open Questions

None for this scope.

The next step after this design is to write an implementation plan for adding the root scripts, extending `packages/web`, and verifying the resulting commands.
