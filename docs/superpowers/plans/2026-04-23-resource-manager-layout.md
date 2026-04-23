# Resource Manager Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `packages/resource-manager/src` into `core`, `loaders`, and `shared` without changing runtime behavior.

**Architecture:** The package keeps the same public API and test suite, but its internals are regrouped by responsibility. `core` owns preload orchestration, `loaders` owns browser-specific resource loading, and `shared` owns reusable types and primitives such as logging and concurrency.

**Tech Stack:** TypeScript, Vitest, tsdown, pnpm workspace.

---

## File Structure

- Modify: `packages/resource-manager/src/index.ts`
- Create: `packages/resource-manager/src/core/*`
- Create: `packages/resource-manager/src/shared/*`
- Modify: `packages/resource-manager/src/loaders/*`
- Modify: `packages/resource-manager/test/*.spec.ts`

### Task 1: Lock the intended import layout with tests

**Files:**
- Modify: `packages/resource-manager/test/loaders.spec.ts`

- [ ] **Step 1: Write the failing test/import update**
- [ ] **Step 2: Run the targeted test and watch it fail because the new paths do not exist yet**
- [ ] **Step 3: Move files and update imports**
- [ ] **Step 4: Re-run the targeted test and confirm it passes**

### Task 2: Rewire the package entrypoint

**Files:**
- Modify: `packages/resource-manager/src/index.ts`

- [ ] **Step 1: Point public exports at `core` and `shared`**
- [ ] **Step 2: Run the package-level test suite**
- [ ] **Step 3: Fix any remaining import path regressions**

### Task 3: Verify the package

**Files:**
- No additional source files

- [ ] **Step 1: Run the full `@laziest/resource-manager` test suite**
- [ ] **Step 2: Run build and typecheck**
- [ ] **Step 3: Confirm the old `src/resource-manager` tree is gone**
