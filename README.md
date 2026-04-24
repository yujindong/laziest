# laziest

`laziest` is a pnpm monorepo for browser-focused runtime utilities and supporting examples.

## Packages

### `@laziest/resource-manager`

Browser-only resource loading with static plans, priority scheduling, blocking groups, and background continuation.

- Package README: [`packages/resource-manager/README.md`](./packages/resource-manager/README.md)
- Chinese README: [`packages/resource-manager/README.zh-CN.md`](./packages/resource-manager/README.zh-CN.md)
- npm: <https://www.npmjs.com/package/@laziest/resource-manager>

### `@laziest/web`

Browser runtime utilities for web applications.

- Package README: [`packages/web/README.md`](./packages/web/README.md)
- Chinese README: [`packages/web/README.zh-CN.md`](./packages/web/README.zh-CN.md)

## Examples

The repository includes a React example app under [`examples/react`](./examples/react) for local development and manual verification.

## Getting Started

Install dependencies:

```bash
pnpm install
```

Common workspace commands:

```bash
pnpm build:web
pnpm build:resource-manager
pnpm test:web
pnpm test:resource-manager
```

Run release metadata checks:

```bash
pnpm changeset:status
```

## Release Flow

This repo uses Changesets for versioning and publishing.

Create a changeset:

```bash
pnpm changeset
```

Apply version updates:

```bash
pnpm version-packages
```

Publish packages:

```bash
pnpm release
```

## Repo Layout

```text
packages/      Published workspace packages
examples/      Private example applications
.changeset/    Release notes and versioning metadata
docs/          Design and implementation notes
```
