# React Example App For `@laziest/web`

**Date:** 2026-04-13

## Goal

Add an `examples/` directory at the repository root and create a real Vite + React example app at `examples/react` to demonstrate how to use `@laziest/web` in a browser environment.

The example should be a multi-demo application rather than a single demo page. It should use `@tanstack/react-router` file-based routing, expose a homepage that acts as the entry point for all demos, and include the `ResourceManager` example as the first routed demo page. This gives the repository a stable examples shell for future APIs without reworking the app structure later.

## Scope

This design covers:

- Monorepo integration for a new `examples/react` workspace package
- A Vite + React + TypeScript example application
- `@tanstack/react-router` file-based routing
- A homepage that lists demo entries
- Local static demo assets under the example app
- A UI that demonstrates `ResourceManager` usage and behavior
- Example-specific scripts for local development and build verification

This design does not cover:

- Publishing the example app
- Adding additional frameworks such as Vue or vanilla examples
- Creating a reusable demo framework shared across future example apps
- End-to-end browser automation tests for the example app

## Constraints

- The example must live under a new root-level `examples/` directory
- The React app must be created with Vite
- Routing must use `@tanstack/react-router` with file-based routes
- The app homepage must act as the index of available demos
- The demo must use the real `@laziest/web` package from the current monorepo
- Demo assets should be local to the example app so it can run reliably without external network dependencies
- The UI should focus on explaining library behavior, not on visual polish for marketing
- The example should stay small enough to maintain easily

## Recommended Approach

### Option A: Workspace example app at `examples/react`

Create `examples/react` as a pnpm workspace package with its own Vite config, React app entry, and local assets. Depend on `@laziest/web` through the workspace.

Pros:

- Clean monorepo structure
- Real consumer-style integration against the package
- Easy to run independently with `pnpm --filter`
- Scales naturally if the repository later adds more examples

Cons:

- Requires touching workspace config and root scripts
- Slightly more setup than dropping a demo into an existing package

### Option B: Demo nested inside `packages/web`

Put a Vite app inside `packages/web/demo` or a similar subdirectory.

Pros:

- Fewer root-level changes
- Local development is physically close to the package

Cons:

- Blurs the boundary between library source and example consumer
- Harder to grow into multiple examples later
- More likely to create accidental coupling between package internals and demo code

### Option C: Standalone non-workspace example directory

Create `examples/react` but do not add it to the pnpm workspace. Reference the package via relative paths.

Pros:

- Minimal workspace changes

Cons:

- Weaker dependency management
- Less consistent tooling and commands
- Worse long-term maintenance ergonomics

### Recommendation

Use Option A. It matches how the package should be consumed, keeps the repository layout clean, and leaves room for more examples later.

## Directory Layout

Add the example with this structure:

```txt
examples/
  react/
    index.html
    package.json
    tsconfig.json
    tsconfig.app.json
    tsconfig.node.json
    vite.config.ts
    public/
      assets/
        image/
        font/
        audio/
        video/
        data/
    src/
      main.tsx
      styles.css
      route-tree.gen.ts
      routes/
        __root.tsx
        index.tsx
        resource-manager.tsx
      demo/
        manager.ts
        resource-groups.ts
        use-resource-manager.ts
        components/
          demo-card.tsx
          controls.tsx
          snapshot-panel.tsx
          active-items-panel.tsx
          completed-items-panel.tsx
          event-log-panel.tsx
          errors-panel.tsx
```

Design intent:

- Keep app bootstrapping conventional Vite React
- Make routing first-class from the beginning so new demos plug into the same shell
- Use file-based routes so demo pages are easy to add without maintaining a hand-written route table
- Keep `ResourceManager`-specific wiring in a small `demo/` area
- Separate the page into focused panels so each part is readable and maintainable

## Workspace Integration

Required repository changes:

- Update `pnpm-workspace.yaml` to include `examples/*`
- Add root scripts for the example app, such as:
  - `dev:react-example`
  - `build:react-example`
- Add example package dependencies needed for React + Vite
- Add example package dependencies needed for `@tanstack/react-router` file-based routing
- Add a dependency from `examples/react` to `@laziest/web`

The example should consume the package through workspace resolution instead of importing source files directly from `packages/web/src`.

The example should also include the routing setup needed for file-based route generation. The exact plugin and script names can follow current TanStack Router conventions, but the generated route tree should be treated as build output, not hand-edited application code.

## Routing Model

The example app should be structured as a small examples portal.

Required initial routes:

- `/`
  Demo index page that introduces the examples app and lists the available demos
- `/resource-manager`
  The first real demo page for `@laziest/web` `ResourceManager`

Expected route responsibilities:

- `routes/__root.tsx`
  Shared app shell, layout, header, and `Outlet`
- `routes/index.tsx`
  Demo homepage with entry cards or links
- `routes/resource-manager.tsx`
  Full `ResourceManager` example page

Design rule:

- The homepage should be the stable entry point for the whole examples app
- Each future API demo should get its own route page and homepage entry
- Demo-specific state should stay inside the route that owns the demo unless there is a clear need to share it globally

## Demo Homepage

The homepage should act as the index of demos, not as a marketing landing page.

It should show:

- the examples app title and short purpose statement
- a list of available demos
- one entry card or row for `ResourceManager`
- short descriptions of what each demo demonstrates

This page should make it obvious that more API demos can be added later without changing the app architecture.

## ResourceManager Demo Behavior

The `/resource-manager` route should present one shared `ResourceManager` instance and several preset workflows that make the library behavior visible.

### Preset Resource Groups

The UI should provide at least three resource groups:

1. `Basic`
   Shows normal successful preload of image, font, JSON, text, and lottie/json data.

2. `Media`
   Shows audio and video resource preloading with the same progress/state model.

3. `Failure Lab`
   Intentionally mixes:
   - one required missing resource for final failure
   - one optional missing resource for skipped warning
   - one fetch-backed resource that can surface retry behavior

The groups should be implemented as simple configuration objects so users can inspect how `ResourceBuckets` are authored.

### Controls

The `ResourceManager` demo page should provide:

- a resource group selector
- a `Preload` action
- an `Abort` action
- a `Reset` action
- a concurrency input
- a log-level selector

Changing concurrency or log level should recreate the current manager instance cleanly for the demo, rather than mutate internal private state.

## ResourceManager Demo UI Sections

The `ResourceManager` demo page should focus on observability. Recommended sections:

### Overview

Show:

- current session status
- total resource count
- completed, loading, failed, skipped counts
- overall progress percentage

### Active Items

Show currently loading resources, including:

- URL
- type
- attempt count
- byte progress if available

### Completed Items

Show recently completed items, including:

- final status
- duration
- cache-hit information
- error summary if failed

### Event Log

Show a rolling list of emitted events such as:

- `session-started`
- `item-started`
- `item-progress`
- `item-retrying`
- `item-failed`
- `session-completed`
- `session-failed`
- `session-aborted`

The event log should help developers see how subscription payloads evolve over time.

### Errors And Warnings

Show structured:

- `snapshot.errors`
- `snapshot.warnings`

This is important because the library intentionally separates runtime state from console logging.

## Shared Manager Pattern In React

The `ResourceManager` route should explicitly model the recommended usage pattern:

- create one `ResourceManager` instance for the current demo scope
- share it across components
- call `preload()` from a control component
- observe state from separate display components

Implementation recommendation:

- keep the manager in top-level React state
- expose `snapshot`, `events`, and actions through a small custom hook
- subscribe once near the app root and fan out derived state through props

This keeps the demo readable and matches the intended library usage model.

## Demo Assets

Assets should live under `examples/react/public/assets`.

Recommended contents:

- at least one image asset
- at least one font file
- at least one audio file
- at least one video file
- one lottie-compatible JSON payload
- one standard JSON file
- one text file
- one binary file

Notes:

- Assets should be small enough to keep repository weight reasonable
- The example may use placeholder-scale media files as long as they are valid browser-loadable assets
- Failure scenarios should be produced with intentionally missing URLs rather than corrupting normal assets unless corruption is specifically needed to demonstrate decode or parse failures

## Logging Behavior In The ResourceManager Demo

The `ResourceManager` demo should not try to intercept the internal logger deeply. Instead:

- use the library's `logLevel` option normally
- optionally provide a demo logger that mirrors messages into an on-screen log panel

If a custom logger is used, it should still behave like a normal `ResourceLogger` and remain clearly example-specific.

## Error And Retry Demonstration

The `ResourceManager` demo should explain these cases clearly:

- required 404 rejects `preload()`
- optional 404 becomes warning + skipped item
- retryable failures appear in events and state
- abort transitions the session to `aborted`

Because real transient network failures are hard to guarantee in a static demo, the retry demonstration may use an example-only custom loader override or a deliberately scripted fetch path inside the example app. This is acceptable as long as the UI still uses the public `ResourceManager` API and the behavior is clearly labeled as a demo scenario.

## Scripts And Developer Experience

At minimum, support:

- `pnpm --filter react-example dev`
- `pnpm --filter react-example build`

Naming can vary, but the example package should have a stable package name and local scripts so developers do not need custom one-off commands.

## Testing And Verification

Required verification:

- workspace install succeeds with the new example package
- the example app builds successfully
- the example app runs locally in Vite dev mode
- the homepage shows the available demo entries
- the `/resource-manager` page can trigger successful preload sessions
- the `/resource-manager` page can demonstrate failure, warning, and abort states

This initial version does not require automated UI tests. Manual verification is acceptable because the example app is primarily for documentation and local exploration.

## Final Recommendation

Implement a new workspace app at `examples/react` using Vite + React + TypeScript, adopt `@tanstack/react-router` file-based routing from the start, make `/` the examples index page, add `/resource-manager` as the first demo route, wire the app to the local `@laziest/web` package through the workspace, keep all demo assets local under `public/assets`, and build a compact observability-first `ResourceManager` demo page. This gives the repository a durable examples shell for future APIs without coupling demo code into the package source tree.
