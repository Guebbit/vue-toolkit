---
source: src/internal/settleCallbacks.ts
sha256: 3c67d46d263ec1cb373603ba44f0a4ca1f0558adfa2e8e09ce0cb663e87409e7
generated_at: 2026-09-28T22:37:40.583623+00:00
model: ollama:qwen3.8:27b
---

# src/internal/settleCallbacks.ts

## Purpose

Provides `onSuccess` / `onError` / `onSettled` callbacks for an active `useQuery`-based watcher. Because TanStack Vue Query has no per-query callback hooks, this module derives settlement events from the query cache and a key-change watcher, deferring callback invocation to a microtask so it never runs inside TanStack's own notify dispatch.

## Key elements

- **`ISettleReaders<R, C>`** — Interface the caller supplies. Exposes `queryKey()`, `isFresh()`, `result()`, and `context()` so the module can read the current watched state without owning it.
- **`watchSettled<R, C>(queryClient, readers, callbacks)`** — Main export. Subscribes to the query cache, watches the key hash for cached-settle, and returns `{ settleIfUnchanged }` for callers that re-apply an already-handled key. Must be called inside an effect scope (registers `onScopeDispose` cleanup).
- **`succeed` / `fail` (internal)** — Read `result`/`context` eagerly, then defer the actual `callbacks.*` calls via `queueMicrotask`.
- **`settleCached` (internal)** — Checks that the watched query's `fetchStatus` is not `'fetching'` and that `readers.isFresh()` is true before reporting a success.
- **`settleIfUnchanged`** — Returns true (settles) only when the key the caller just applied is identical to the hash the key-watcher already handled.

## Relationships

- **`src/composables/structureRestApi.ts`** — Source of the `IWatchCallbacks<R, C>` type consumed by `watchSettled`; the REST composable that calls this module to wire its success/error/settled hooks.
- **`src/composables/structureSearchApi.ts`** — Consumer composable that builds a watcher and passes its readers + callbacks into `watchSettled`.
- **`src/internal/restResource.ts`** — Adjacent internal module providing shared query-client / resource plumbing used by the composables above.
- **`tests/internal/settleCallbacks.spec.ts`** — Unit tests covering settle-on-fetch, settle-on-cache, cancellation exclusion, and the microtask deferral contract.
- **`tests/package/smoke.mjs`** — End-to-end smoke test that exercises the full settle path through the public API.
- **`package.json`** — Declares the runtime dependencies this file imports: `vue` (scope, watch) and `@tanstack/vue-query` (`hashKey`, `CancelledError`, `QueryClient`).

## Notes

- Callbacks are **always** deferred via `queueMicrotask`. Running them synchronously inside TanStack's cache-notify dispatch means a throwing callback corrupts the dispatch (puts the query into an error state and fires `onError` for a fetch that actually succeeded). The microtask deferral converts a throw into a plain uncaught error and leaves query state intact.
- `CancelledError` instances are filtered out of the error path; they are not reported to `onError` or `onSettled`.
- `action.manual` successes (i.e. `setQueryData` writes) are excluded — they are not fetch settlements.
- `handledHash` is updated by the `watch` on the key hash; `settleIfUnchanged` compares against it to avoid double-settling when a caller re-applies the same key.
- The module must be called **inside** an active effect scope; it calls `onScopeDispose(stop)` to unsubscribe from the query cache when the scope ends.
