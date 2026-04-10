# `@laziest/web` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold `packages/web` as a workspace package named `@laziest/web` with `tsdown`-based build output and a stable root-package consumption contract, without adding any concrete utility modules yet.

**Architecture:** Create a minimal package with a single public root entry at `src/index.ts`, package-local TypeScript and `tsdown` configuration, and package metadata that exports built ESM, CJS, and type declarations from `dist/`. Verification is limited to package build success and inspection of generated artifacts because there are no concrete runtime APIs to test yet.

**Tech Stack:** `pnpm` workspace, TypeScript, `tsdown`

---

## File Map

- Create: `packages/web/package.json`
  Responsibility: declare the workspace package name `@laziest/web`, package entry fields, and build script.
- Create: `packages/web/tsconfig.json`
  Responsibility: define package-local TypeScript settings for source compilation and declaration generation compatibility.
- Create: `packages/web/tsdown.config.ts`
  Responsibility: configure `tsdown` to build `src/index.ts` into ESM, CJS, and declaration outputs under `dist/`.
- Create: `packages/web/src/index.ts`
  Responsibility: provide the single public root entry with no concrete utilities yet.
- Modify: `package.json`
  Responsibility: add a root-level convenience script for building the package from the monorepo root.

## Task 1: Scaffold `@laziest/web` Package Metadata

**Files:**
- Create: `packages/web/package.json`

- [ ] **Step 1: Create the package manifest**

Use this file content:

```json
{
  "name": "@laziest/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "sideEffects": false,
  "files": [
    "dist"
  ],
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "scripts": {
    "build": "tsdown"
  }
}
```

- [ ] **Step 2: Verify the manifest was written correctly**

Run: `sed -n '1,220p' packages/web/package.json`
Expected: the output shows `name` as `@laziest/web`, `exports` for `"."`, and a `build` script that runs `tsdown`

- [ ] **Step 3: Commit the metadata scaffold**

```bash
git add packages/web/package.json
git commit -m "feat: add @laziest/web package manifest"
```

## Task 2: Add Package-Local TypeScript and `tsdown` Config

**Files:**
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/tsdown.config.ts`

- [ ] **Step 1: Create the package TypeScript config**

Use this file content:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "declaration": true,
    "declarationMap": false,
    "sourceMap": true,
    "noEmit": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  },
  "include": ["src", "tsdown.config.ts"]
}
```

- [ ] **Step 2: Create the `tsdown` config**

Use this file content:

```ts
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  outDir: 'dist',
})
```

- [ ] **Step 3: Verify both config files**

Run: `sed -n '1,220p' packages/web/tsconfig.json && printf '\n' && sed -n '1,220p' packages/web/tsdown.config.ts`
Expected: `tsconfig.json` includes DOM libs and bundler resolution, and `tsdown.config.ts` builds `./src/index.ts` to `dist` with `esm`, `cjs`, and `dts`

- [ ] **Step 4: Commit the package config**

```bash
git add packages/web/tsconfig.json packages/web/tsdown.config.ts
git commit -m "build: configure tsdown for @laziest/web"
```

## Task 3: Add the Root Entry Without Concrete Utilities

**Files:**
- Create: `packages/web/src/index.ts`

- [ ] **Step 1: Create the root entry file**

Use this file content:

```ts
export {}
```

- [ ] **Step 2: Verify the root entry stays intentionally empty**

Run: `sed -n '1,80p' packages/web/src/index.ts`
Expected: the file contains only `export {}`

- [ ] **Step 3: Commit the root entry**

```bash
git add packages/web/src/index.ts
git commit -m "feat: add root entry for @laziest/web"
```

## Task 4: Add Root-Level Build Convenience

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update the root manifest scripts**

Change `package.json` from:

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
  "scripts": {},
  "packageManager": "pnpm@10.33.0",
  "devDependencies": {
    "tsdown": "^0.21.7"
  }
}
```

to:

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
    "build:web": "pnpm --filter @laziest/web build"
  },
  "packageManager": "pnpm@10.33.0",
  "devDependencies": {
    "tsdown": "^0.21.7"
  }
}
```

- [ ] **Step 2: Verify the root script**

Run: `sed -n '1,220p' package.json`
Expected: `scripts.build:web` exists and runs `pnpm --filter @laziest/web build`

- [ ] **Step 3: Commit the root script**

```bash
git add package.json
git commit -m "build: add @laziest/web workspace build script"
```

## Task 5: Build and Verify Generated Artifacts

**Files:**
- Verify: `packages/web/dist/index.js`
- Verify: `packages/web/dist/index.cjs`
- Verify: `packages/web/dist/index.d.ts`

- [ ] **Step 1: Run the package build from the workspace root**

Run: `pnpm build:web`
Expected: successful `tsdown` build for `@laziest/web` with no errors

- [ ] **Step 2: Verify generated outputs exist**

Run: `find packages/web/dist -maxdepth 1 -type f | sort`
Expected:

```text
packages/web/dist/index.cjs
packages/web/dist/index.d.ts
packages/web/dist/index.js
```

- [ ] **Step 3: Inspect generated output shape**

Run: `sed -n '1,80p' packages/web/dist/index.js && printf '\n' && sed -n '1,80p' packages/web/dist/index.cjs && printf '\n' && sed -n '1,80p' packages/web/dist/index.d.ts`
Expected:

- `index.js` is a valid ESM module
- `index.cjs` is a valid CJS module
- `index.d.ts` exists and matches an intentionally empty root entry

- [ ] **Step 4: Commit the scaffolding completion**

```bash
git add packages/web package.json
git commit -m "feat: scaffold @laziest/web package"
```

## Notes

- Do not add domain folders such as `url/` or `request/` yet.
- Do not add placeholder utility functions.
- Do not add tests that assert fake behavior for non-existent APIs.
- If `tsdown` emits file names that differ from this plan, update `package.json` entry fields to match the actual generated outputs before the final commit.
