---
source: tests/internal/settleCallbacks.spec.ts
sha256: ad7c3f0c9d1555a642575be83f0745db58adca866f1b08f1048ff656f8a975c6
generated_at: 2026-09-28T22:42:18.221577+00:00
model: ollama:qwen3.8:27b
---

# tests/internal/settleCallbacks.spec.ts

## Purpose

Integration test for `watchSettled` (from `src/internal/settleCallbacks.ts`) that exercises the callback lifecycle against a **real** `QueryClient` instance. It verifies two invariants: (1) a cached settle never fires while the watched key is mid-fetch, and (2) `settleIfUnchanged` only re-fires for the key the watcher has already handled.

## Key elements

- **`flush`** — Promises a `setTimeout(0)` to let the microtask queue drain so deferred callbacks (queued by `watchSettled`) execute before assertions run.
- **`watch(key, fresh)`** — Local helper (not exported). Calls `scope.run(() => watchSettled(client, …))` with reactive `queryKey`, `isFresh`, `result`, and `context` getters, plus `jest.fn()` spies for `onSuccess` / `onSettled`. Returns `{ onSuccess, onSettled, handle }`.
- **`beforeEach` / `afterEach`** — Create a fresh `QueryClient` and a Vue `EffectScope` per test; tear down both afterward so no cross-test leakage.
- **`describe('settle from cache')`** — Three cases covering: fresh + idle → fires; stale → suppressed; fresh + `fetchStatus === 'fetching'` (a never-resolving `fetchQuery`) → suppressed.
- **`describe('settleIfUnchanged')`** — Two cases covering: key unchanged after settle → `settleIfUnchanged` re-fires once; key mutated synchronously before the watcher's internal hash updates → no fire.

## Relationships

- **`src/internal/settleCallbacks.ts`** — The module under test. This spec imports `watchSettled` and exercises its public contract (callback timing and the `settleIfUnchanged` handle method).
- **`package.json`** — Supplies the runtime/test dependencies this file relies on: `vue` (`effectScope`, `ref`), `@tanstack/vue-query` (`QueryClient`), and `jest` (test runner, `jest.fn`, lifecycle hooks).

## Notes

- The "fetching" test kicks off a `fetchQuery` whose `queryFn` returns a promise that **never** resolves. The trailing `.catch(() => {})` swallows the rejection produced by `client.clear()` in `afterEach`; this is intentional, not a bug.
- The `settleIfUnchanged` "key changed" test deliberately mutates `key.value` **synchronously** after the first flush, before the internal watcher has a chance to update its `handledHash`. The subsequent `await Promise.resolve()` is only to let `settleIfUnchanged`'s own deferred work settle so the "not called" assertion is meaningful.
- Tests run inside a Vue `EffectScope` so that `watchSettled`'s reactive watchers are stopped cleanly per test; forgetting `scope.stop()` would leak watchers across tests.
