# `packages/web` Design

## Summary

Add a new workspace package at `packages/web` with the package name `@laziest/web`, as a single-package, web-general utility library for code that is reusable across web applications and does not depend on framework or host-platform integration.

This document defines architecture only. It does not introduce concrete utility modules yet.

## Goals

- Provide a clear home for web-general utilities in the monorepo.
- Keep the package independent from framework, business-domain, and host-platform concerns.
- Use `tsdown` as the package build tool.
- Start with a minimal package shape that is easy to extend without premature structure.

## Non-Goals

- Defining the first utility APIs.
- Adding framework-specific helpers such as React or Vue utilities.
- Adding server-only or Node-specific helpers.
- Designing platform adapters for Electron, Tauri, mini-programs, or native runtimes.

## Package Positioning

`packages/web` is the shared utility layer for browser-oriented applications.

Its published package identity is `@laziest/web`.

It is intended for capabilities that:

- are meaningful in generic web applications,
- can be reused across projects,
- do not encode product or business semantics,
- do not require a specific framework runtime,
- do not depend on a specific host platform.

The package may rely on standard Web APIs and Web platform concepts when needed, but it should not become a catch-all for unrelated helpers.

## Responsibility Boundary

### Belongs in `packages/web`

- Web-standard utility capabilities with no business meaning.
- Reusable helpers around browser-oriented semantics.
- Pure functions or light abstractions over standard web concepts.
- Foundation code that can be consumed by different web applications without adaptation to their framework or runtime container.

Representative future domains include:

- URL and query handling
- request and response helpers
- serialization and encoding helpers
- browser capability checks
- event-related helpers

These examples are illustrative only and do not imply immediate implementation.

### Does Not Belong in `packages/web`

- Business or product-specific helpers
- UI components
- Framework hooks or framework-bound abstractions
- Server-only logic
- Node-specific APIs
- Multi-platform adapters
- Utilities that require knowledge of a host application's architecture or conventions

### Admission Rule

A module belongs in `packages/web` only if it remains valid in a generic web application and does not need to know:

- which framework is used,
- which business domain it serves,
- which host platform wraps the web app.

If a module crosses one of those boundaries, it should live somewhere else.

## Package Architecture

The package starts as a single workspace package with a single public root entry.

Initial directory shape:

```text
packages/web/
  package.json
  tsconfig.json
  tsdown.config.ts
  src/
    index.ts
```

### Entry Strategy

- `src/index.ts` is the only public entry point at the start.
- Consumers import from `@laziest/web` rather than internal files.
- Internal file layout may evolve without forcing API-path churn for consumers.

### Internal Structure Strategy

- Do not pre-create empty domain folders.
- When the first real utilities are added, they can live next to `src/index.ts` if they are still few and small.
- When one domain accumulates multiple related utilities, move them into `src/<domain>/`.
- Root exports remain stable through `src/index.ts` even if internal organization changes.

This avoids committing to a folder taxonomy before there is real pressure from usage.

## Build Design

`packages/web` uses `tsdown` as its package bundler.

Build expectations:

- output to `dist/`
- generate ESM output
- generate CJS output
- generate type declarations

The package metadata should define stable consumer entry fields from the start:

- `name` as `@laziest/web`
- `exports`
- `main`
- `module`
- `types`

This keeps the consumption contract stable even while the package is still empty or near-empty.

## API Surface Principles

- Public API is curated through the root entry only.
- Internal structure is not part of the public contract.
- Utilities should default to pure functions or minimal abstractions.
- Avoid implicit global state.
- Avoid naming that hides responsibility behind vague buckets such as `helpers`, `common`, or `misc`.
- Prefer domain names that describe web concepts, such as `url`, `request`, or `encoding`, once real domains appear.

## Growth Rules

When the package starts receiving concrete utilities, follow these rules:

1. Add new capabilities with the smallest reasonable structure.
2. Keep root exports stable.
3. Introduce domain directories only when there is enough related code to justify them.
4. Reject modules that need framework or platform awareness.
5. Keep package scope focused on reusable web-general capabilities.

## Testing Expectations

No test layout is defined yet because there are no concrete modules.

When implementation begins:

- tests should be added alongside the first utilities or in a package-level test layout consistent with the repository's emerging conventions,
- tests should validate behavior without depending on business context,
- environment assumptions should remain browser-general unless a module explicitly documents narrower expectations.

## Open Questions

None for the current architecture scope.

The next step, when needed, is to create an implementation plan for scaffolding `packages/web` and defining the first concrete utility module.
