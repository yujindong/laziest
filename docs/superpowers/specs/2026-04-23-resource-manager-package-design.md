# Resource Manager Package Design

**Date:** 2026-04-23

## Goal

Create a standalone `resource-manager` package by porting the existing browser-side resource loading implementation from `packages/web` into its own publishable workspace package, without modifying any existing `packages/web` code or package metadata.

## Scope

This design covers:

- A new workspace package under `packages/resource-manager`
- Public exports for `ResourceManager`, related types, errors, and logger helpers
- Standalone build and test configuration for the new package
- A copied test suite proving the standalone package behaves like the existing `web` implementation
- Root workspace scripts needed to build and test the new package

This design does not cover:

- Refactoring `packages/web` to depend on the new package
- Removing or changing any `packages/web` exports
- Updating examples to consume the new package
- Shared internal abstractions between `web` and `resource-manager`

## Constraints

- `packages/web` source and package metadata remain unchanged
- The new package should be independently buildable and testable
- The implementation should preserve the current browser-only behavior
- The fastest low-risk path is preferred over deduplicating code across packages

## Approaches

### Option A: Copy the implementation into a new package

Create a new workspace package and port the existing `resource-manager` source and tests into it with package-local entrypoints and config.

Pros:

- Does not touch `packages/web`
- Lowest implementation risk
- Keeps behavior parity easy to verify

Cons:

- Duplicates code across two packages
- Future bug fixes may need to be applied twice

### Option B: Extract a shared internal package and rewire `web`

Move the implementation into a shared package and make `web` consume it.

Pros:

- Avoids duplication
- Cleaner long-term maintenance

Cons:

- Violates the requirement to avoid changing `web`
- Broader surface area and higher regression risk

## Recommendation

Use Option A for this change. Create `packages/resource-manager`, copy the existing implementation and tests from `packages/web`, and keep `web` untouched.

## Design

### Package Layout

The new package will mirror the structure already proven in `packages/web`:

- `packages/resource-manager/package.json`
- `packages/resource-manager/tsconfig.json`
- `packages/resource-manager/tsdown.config.ts`
- `packages/resource-manager/vitest.config.ts`
- `packages/resource-manager/src/index.ts`
- `packages/resource-manager/src/resource-manager/**`
- `packages/resource-manager/test/**`

### Public API

The new root entrypoint will export the same public symbols currently exposed from `packages/web`:

- `ResourceManager`
- `ResourcePreloadError`
- `consoleResourceLogger`
- `shouldLog`
- all resource-manager public types

### Testing

The copied package will carry its own Vitest suite and helper fakes so behavior can be verified without relying on `packages/web`.

### Root Workspace Integration

The root `package.json` will add dedicated scripts for building and testing `@laziest/resource-manager`. Existing `web` scripts remain unchanged.
