---
source: tests/structureRestApi/effects/loading-stability.spec.ts
sha256: 1daa64f697828d919f1742ad4fc97cf0aa4998f185b0d3bdb331a9358a1d9b80
generated_at: 2026-09-28T22:48:58.113349+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/effects/loading-stability.spec.ts

## Purpose

Verifies that `isLoading()` produces exactly one `false→true→false` cycle under concurrent, overlapping requests (fetches, mutations, or a mix). It guards against a regression where a naive per-request boolean toggle would flicker off when the first request resolves while others are still in flight. The test relies on TanStack Query's `isFetching()`/`isMutating()` counters as the single source of truth.

## Key elements

- **`trackLoading(c)`** — Wraps Vue's `watch` on `c.isLoading()` with `flush: 'sync'` to record every boolean transition in order into a `seq` array. Returns `{ seq, stop }` so tests can assert the exact transition sequence.
- **`watchers` (module-level array)** — Collects all active `WatchStopHandle`s so `afterEach` can tear them down even when an assertion throws.
- **Test: "single false→true→false cycle"** — Fires three `fetchAll` calls on distinct cache keys via `deferredApi`, resolves them out of order, and asserts `isLoading()` stays `true` until the last settles. Final `seq` must be exactly `[true, false]`.
- **Test: "rejects also turn isLoading off"** — A single `fetchAll` that rejects with an error; asserts `isLoading()` returns to `false` and the sequence is `[true, false]`.
- **Test: "mutation and fetch overlapping"** — Overlaps one `fetchAll` with one `mutateAny`; resolving the fetch alone must not flip `isLoading()` off until the mutation also settles.

## Relationships

- **`_helpers/harness.ts`** — Provides `makeComposable` (the SUT under test) and `clearAllInstances` for teardown.
- **`_helpers/fakeApi.ts`** — Provides `deferredApi`, a controllable promise pair (`call` + `control.resolve/reject`) used to orchestrate overlapping request timing.
- **`_helpers/fixtures.ts`** — Supplies the `USERS` array and `IUser` type used as payload data.
- **`package.json`** — Supplies the Vitest runner (`describe`, `it`, `expect`, `afterEach`) and the Vue runtime used by the `watch` import.
- **`served-value.spec.ts`** — Sibling spec in the same `effects` suite; tests the data-serving side of the composable while this file covers the loading-state side.

## Notes

- Each test uses distinct cache keys (`['A']`, `['B']`, `['C']`) specifically to prevent TanStack Query from deduplicating requests, ensuring true concurrency.
- `flush: 'sync'` on the watcher is critical: it guarantees `seq` captures transitions in real-time order rather than batching them in a microtask, making the "no flicker" assertion meaningful.
- The `watchers` array is spliced in `afterEach` rather than in a `finally` block inside each test, so teardown is guaranteed even on assertion failure.
