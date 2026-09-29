---
source: tests/browser/plugin.spec.ts
sha256: 53d07d8b24afe7a6f3b9f2047f5d03fa24e9e4c4d270dbfef0e92205ebe95eb1
generated_at: 2026-09-28T22:40:02.703961+00:00
model: ollama:qwen3.8:27b
---

# tests/browser/plugin.spec.ts

## Purpose

Exercises `VueQueryPlugin` inside a **real, mounted Vue app** (`createApp(...).mount(div)`) to verify that a composable's internal `effectScope()` calls are true children of the component scope and that `app.unmount()` cascades into them. This is the one code path that the shared `runInjected` harness deliberately shortcuts around; this file exists to prove that wiring works when a component is actually mounted and unmounted.

## Key elements

- **`renderNothing`** – Minimal render function (`h('div')`) used as the component's render output; the tests never inspect the DOM.
- **`mountedApp` / `activeQueryClient`** (module-level) – Tracks the current app and query client so `afterEach` can tear them down even if an assertion throws.
- **`afterEach`** – Calls `unmount()` (if the test didn't already unmount) and `queryClient.clear()` to isolate tests.
- **Test 1: `useQueryClient()` inside `setup()`** – Asserts the client injected by `app.use(VueQueryPlugin, …)` is the exact instance passed in.
- **Test 2: resource watches while mounted** – Builds a `useStructureRestApi` resource, calls `watchAll`, verifies the initial fetch fires and that `invalidateQueries` triggers a second fetch (i.e. the watcher is active).
- **Test 3: unmounting stops the watcher** – After unmounting mid-test, confirms a subsequent `invalidateQueries` does **not** refetch, proving the effect scope was truly disposed.

## Relationships

- **`src/composables/structureRestApi.ts`** – Imports `useStructureRestApi`; this file is the only spec that calls it inside a real `setup()` of a mounted app.
- **`tests/structureRestApi/_helpers/harness.ts`** – Reuses only `newTestClient()` and `flush()`; explicitly does **not** use `runInjected` because that helper never mounts an app.
- **`tests/structureRestApi/_helpers/fixtures.ts`** – Imports `USERS` (mock data) and the `IUser` type for the resource generics.
- **`docs/guide/testing.md`** – Documents the testing conventions (including why this file bypasses the harness).
- **`package.json`** – Provides the Jest/Stryker runner configuration that makes the `@jest-environment` pragma and `npm test` invocation work.

## Notes

- The file-top `@jest-environment @stryker-mutator/jest-runner/jest-env/jsdom` pragma is **required** for Stryker mutation testing (it wraps `jest-environment-jsdom` with coverage instrumentation). Removing it breaks mutation runs but not plain `npm test`.
- The third test sets `mountedApp = undefined` after its own `app.unmount()` to avoid a harmless-but-noisy double-unmount in `afterEach`.
- This file intentionally avoids `@vue/test-utils` and the shared `runInjected` helper; adding either would defeat its purpose of exercising the real mount/unmount lifecycle.
