# Resource Manager Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone `@laziest/resource-manager` workspace package by porting the current browser resource manager implementation out of `packages/web` without changing `packages/web`.

**Architecture:** The new package mirrors the proven `packages/web` package layout with its own source entrypoint, copied `resource-manager` modules, and copied Vitest suite. Root workspace scripts expose build and test commands for the new package while leaving all existing `web` package configuration intact.

**Tech Stack:** TypeScript, tsdown, Vitest, jsdom, pnpm workspace.

---

## File Structure

- Create: `packages/resource-manager/package.json`
- Create: `packages/resource-manager/tsconfig.json`
- Create: `packages/resource-manager/tsdown.config.ts`
- Create: `packages/resource-manager/vitest.config.ts`
- Create: `packages/resource-manager/src/index.ts`
- Create: `packages/resource-manager/src/resource-manager/**`
- Create: `packages/resource-manager/test/**`
- Modify: `package.json`

## Tasks

### Task 1: Create the standalone package scaffold

**Files:**
- Create: `packages/resource-manager/package.json`
- Create: `packages/resource-manager/tsconfig.json`
- Create: `packages/resource-manager/tsdown.config.ts`
- Create: `packages/resource-manager/vitest.config.ts`

- [ ] Add package metadata for `@laziest/resource-manager` with build, test, coverage, watch, and typecheck scripts.
- [ ] Copy the TypeScript and bundler config shape used by `packages/web`.
- [ ] Configure Vitest to run the package-local `test/**/*.spec.ts` suite in `jsdom`.

### Task 2: Port the implementation and test suite

**Files:**
- Create: `packages/resource-manager/src/index.ts`
- Create: `packages/resource-manager/src/resource-manager/**`
- Create: `packages/resource-manager/test/**`

- [ ] Copy the existing implementation from `packages/web/src/resource-manager/**`.
- [ ] Copy the root entrypoint exports from `packages/web/src/index.ts`.
- [ ] Copy and retarget the existing tests and helpers from `packages/web/test/**`.
- [ ] Add any package-local test setup needed so the copied suite does not depend on `packages/web`.

### Task 3: Wire the workspace and verify behavior

**Files:**
- Modify: `package.json`

- [ ] Add root scripts for `build:resource-manager`, `test:resource-manager`, and optional watch/coverage helpers.
- [ ] Run the new package test suite and fix any path or config issues.
- [ ] Run the new package build and typecheck commands to confirm the standalone package is publishable.
