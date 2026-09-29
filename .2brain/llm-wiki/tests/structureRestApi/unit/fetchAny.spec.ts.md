---
source: tests/structureRestApi/unit/fetchAny.spec.ts
sha256: 6c86cb7a3fa7f944ba9d6067ee8fe9ad3e0bf3703b0aa5d1d7b40d7a5499c6c0
generated_at: 2026-09-28T23:01:48.809828+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/fetchAny.spec.ts

## Purpose

Unit tests for the `fetchAny` generic wrapper, verifying its direct contract: resolving arbitrary async results, opt-in key-based caching, `forced` refresh, error propagation, no residual cache entry on failure, cancellation semantics, and `isLoading()` tracking.

## Key elements

- **`make()`** – local factory that calls `makeComposable<IUser, number>()` to produce a fresh composable instance per test.
- **`afterEach(clearAllInstances)`** – global teardown to reset all composable instances between tests.
- **`describe('UNIT · fetchAny')`** – the single test suite containing 11 `it` blocks covering:
    - Resolution with object and primitive result shapes.
    - No-key calls always execute (no caching).
    - Keyed calls: second identical call served from cache.
    - Distinct keys treated as independent buckets.
    - `forced: true` bypasses a cached entry.
    - Errors are re-thrown; a failed keyed call leaves no cache entry (verified via `queryClient.getQueryCache().find`).
    - A cancelled keyed refresh resolves the previously cached value instead of rejecting (uses `cancelQueries` with `revert: false`).
    - `isLoading()` (and `isLoading(key)`) is `true` during the call and `false` after, regardless of whether a key was supplied.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** – provides `makeComposable` (builds the composable under test), `clearAllInstances` (teardown), and `flush` (advances microtask/macrotask queues for deferred promises).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** – provides `apiReject` / `apiResolve` (quick-resolving/rejecting fakes) and `deferredApi` (returns a controllable pending promise, used in the cancellation test).
- **`tests/structureRestApi/_helpers/fixtures.ts`** – exports the `IUser` type, used as the generic data type parameter in `makeComposable<IUser, number>()`.

## Notes

- The internal TanStack Query key layout for `fetchAny` is `['resource', 'any', [], <userKey…>]`; the cancellation test cancels at the prefix `['resource', 'any']`.
- The cancellation test relies on TanStack's `revert: false` behavior: the in-flight fetch rejects with `CancelledError` but the entry's prior data is preserved, so the awaited promise resolves to that data rather than throwing.
- `isLoading()` can be queried both globally (no argument) and scoped to a specific key; both must reflect the in-flight state of `fetchAny`.
