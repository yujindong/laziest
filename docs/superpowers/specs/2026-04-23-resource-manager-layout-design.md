# Resource Manager Layout Design

**Date:** 2026-04-23

## Goal

Restructure `packages/resource-manager/src` so the package no longer nests all implementation files under a redundant `resource-manager/` directory. The new layout should group files by responsibility using `core`, `loaders`, and `shared`, while preserving package behavior and public exports.

## Scope

This design covers:

- Reorganizing the standalone `@laziest/resource-manager` package source tree
- Updating internal imports and root exports to match the new structure
- Updating tests that reference package-internal modules

This design does not cover:

- Behavior changes to `ResourceManager`
- Changes to `packages/web`
- Example or documentation updates outside this package layout work

## Constraints

- Public package behavior must remain unchanged
- The package should no longer contain `src/resource-manager/*`
- Files should be grouped by responsibility, not by package name

## Approaches

### Option A: `core / loaders / shared`

Use `core` for manager lifecycle code, `loaders` for browser resource loaders, and `shared` for reusable primitives.

Pros:

- Clear ownership boundaries
- Matches the current package size
- Keeps public orchestration code separate from low-level helpers

Cons:

- A few modules such as `normalize` and `errors` are business-oriented rather than purely “core runtime”

### Option B: Flatten everything directly under `src`

Pros:

- Fewest path segments

Cons:

- Weak boundaries as the package grows
- Loader modules and business flow become interleaved

### Option C: `core / loaders / shared / model`

Pros:

- Stronger separation for types and models

Cons:

- Too much structure for the current package size

## Recommendation

Use Option A.

## Directory Design

- `src/core`
  - `resource-manager.ts`
  - `session.ts`
  - `errors.ts`
  - `retry.ts`
  - `normalize.ts`
- `src/loaders`
  - existing built-in browser loaders and registry
- `src/shared`
  - `types.ts`
  - `queue.ts`
  - `logger.ts`

## Public Entry Point

`src/index.ts` should export from the new locations:

- `./core/resource-manager`
- `./core/errors`
- `./shared/logger`
- `./shared/types`

## Testing

Existing tests remain the behavior safety net. Any deep imports used by tests must be retargeted to the new structure so the test suite asserts the intended layout.
