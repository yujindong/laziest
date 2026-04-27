# @laziest/resource-manager

## 0.3.1

### Patch Changes

- Include the root LICENSE file in published package artifacts.

## 0.3.0

### Minor Changes

- 5f03d80: Add a singleton runtime run handle via `getRun()` and make `start()` reuse the same `ResourceRun` instance.

  This lets multiple pages or modules access the same in-flight runtime run without creating duplicate runs.

## 0.2.0

### Minor Changes

- Add a new runtime-oriented loading model built around `ResourcePlan`, `ResourceRuntime`, and `ResourceRun`.

  This release adds:

  - static `ResourcePlan` declarations for groups and items
  - deterministic priority scheduling across groups and items
  - blocking groups with `waitForReady()` and full-run completion with `waitForAll()`
  - runtime snapshots, subscriptions, and explicit run lifecycle states
  - normalized runtime execution with retry, cache reuse, abort handling, and failure classification
  - in-run deduplication and group-aware readiness / failure semantics

  It also applies `maxConcurrentItems` to real runtime execution so configured concurrency limits cap active loads, and refreshes the README to document the runtime API plus browser compatibility and recommended polyfills for `fetch`, `AbortController`, and `URL`.

## 0.1.0

### Minor Changes

- 12986e1: Introduce `@laziest/resource-manager`, a browser-only resource preloading package for images, fonts, audio, video, lottie JSON, JSON, text, and binary assets.

  The package includes:

  - a scene-scoped `ResourceManager`
  - built-in loaders for common browser resource types
  - progress snapshots and subscription events
  - retry support with failure classification
  - configurable concurrency, logging, abort, and reset behavior
