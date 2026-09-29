---
source: tests/browser/focus-online.spec.ts
sha256: 9b4325a253d3b97633b58dacebe4fcb4d32233c9d3c96e084b3340bc55d43f40
generated_at: 2026-09-28T22:39:26.371714+00:00
model: ollama:qwen3.8:27b
---

# tests/browser/focus-online.spec.ts

## Purpose

Pins TanStack Query's browser-side defaults (`refetchOnWindowFocus`, `refetchOnReconnect`) to ensure `useStructureRestApi` correctly refetches active, stale queries on focus return and reconnection, and correctly stays paused or non-reactive in the fresh / one-shot cases. It exists because these behaviors are untestable under a plain Node/Jest environment — `client.mount()` (the subscription to `focusManager`/`onlineManager`) is skipped when `isServer()` is true.

## Key elements

- **`browserClient()`** — factory for a `QueryClient` with `retry: false` but TanStack's default `networkMode: 'online'` (unlike the shared `newTestClient()` which forces `'always'`).
- **`mountedClients`** — module-level array tracking every client created in the file so `afterEach` can unmount them, preventing leaked focus/online subscriptions across tests.
- **`make(staleTime)`** — builds a `browserClient`, registers it for cleanup, injects it via `runInjected`, and returns the `useStructureRestApi` composable bound to the given `staleTime`.
- **`afterEach`** — calls `clearAllInstances()`, unmounts every tracked client, then resets `focusManager` to `undefined` (unset) and `onlineManager` to `true` (its real default).
- **`describe('BROWSER · refetch on window focus')`** — three tests: stale watcher refetches on focus, fresh watcher does not, one-shot `fetchAll` is unaffected.
- **`describe('BROWSER · refetch on reconnect')`** — two tests: stale watcher refetches on reconnect; query started offline stays paused until reconnected (validates `networkMode: 'online'`).

## Relationships

- **`src/composables/structureRestApi.ts`** — imports `useStructureRestApi`, the composable under test.
- **`tests/structureRestApi/_helpers/harness.ts`** — imports `runInjected` (plugin injection), `clearAllInstances` (cache teardown), and `flush` (microtask draining).
- **`tests/structureRestApi/_helpers/fixtures.ts`** — imports `USERS` fixture data and the `IUser` type used as the composable's value type parameter.
- **`docs/guide/testing.md`** — documents the browser-vs-Node test split and the jsdom requirement that this file exemplifies.
- **`tests/structureRestApi/README.md`** — provides the overview of the `structureRestApi` test suite and cross-references this browser-specific spec.

## Notes

- The file-magic comment uses `@stryker-mutator/jest-runner/jest-env/jsdom` rather than plain `jsdom`; Stryker's jest-runner needs its own instrumented jsdom wrapper for coverage-based mutation testing.
- **`networkMode` is the critical difference** from the shared harness: `newTestClient()` sets `'always'` (ignores offline state), which would make every reconnect test trivially pass. This file deliberately uses TanStack's default `'online'` to exercise the pause-on-offline path.
- `focusManager.setFocused(undefined)` is not "focused" or "unfocused" — it is FocusManager's own sentinel meaning "fall back to `document.visibilityState`." `onlineManager` has no such sentinel; `undefined` reads as falsy (offline), so it must be reset to `true` explicitly.
- The `mountedClients` array exists because `clearAllInstances()` only clears query caches; it never calls `client.unmount()`. Without explicit unmounting, the focus/online subscriptions leak into subsequent tests.
