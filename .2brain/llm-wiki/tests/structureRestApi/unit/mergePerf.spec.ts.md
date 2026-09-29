---
source: tests/structureRestApi/unit/mergePerf.spec.ts
sha256: 271984c5fa42c05dba86bd8e72c86a308f9ed869c1744be0547ba654616985c2
generated_at: 2026-09-28T23:05:00.469788+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/mergePerf.spec.ts

## Purpose

Unit test that pins the asymptotic cost of a batch merge write over a large query cache. It asserts that merging 1 000 items over a 3 000-record cache does **not** trigger one full `findAll` sweep per item (the O(N × M) path), by counting `findAll` invocations rather than relying on wall-clock timing.

## Key elements

- **`afterEach` hook** — restores all jest mocks (including the `findAll` spy, even on assertion failure) and calls `clearAllInstances()` to prevent cross-test leakage.
- **`describe` / `it` — "merging 1k items over 3k cached records does not sweep the cache once per item"**
    - Builds a composable via `makeComposable<IUser, number>()` and pre-loads 3 000 users into its cache.
    - Spies on `c.queryClient.getQueryCache().findAll`, then clears its call log.
    - Performs a `fetchAll` with `{ merge: true }` of 1 000 users (ids 1–1000, all already cached).
    - Asserts `findAll` was called **fewer than 20 times** (a constant independent of batch size) and that `itemList.value` still has length 3000.

## Relationships

- **`_helpers/harness.ts`** — provides `makeComposable` (constructs the composable under test) and `clearAllInstances` (tears down global singletons between tests).
- **`_helpers/fakeApi.ts`** — provides `apiResolve`, which wraps static fixture arrays into the resolvable shape `fetchAll` expects, avoiding real network calls.
- **`_helpers/fixtures.ts`** — provides `buildUsers(n)` to generate deterministic `IUser` arrays and the `IUser` type annotation used in the composable generic.

## Notes

- The complexity guard is **call-count based**, not time-based. The comment explicitly calls out that a millisecond budget either flakes under CI CPU contention or, if loosened, no longer catches a regression to the O(N × M) path.
- The `< 20` threshold (not `< 1`) deliberately tolerates a small constant number of legitimate internal sweeps (e.g. `enforceMaxRecords`, incoming-list dictionary rebuild) while still failing the ~1 000 sweeps a per-item `findAll` would produce.
- The spy target is `getQueryCache().findAll` on the composable's internal `queryClient`, **not** an API-layer `findAll`. This isolates the cache-sweep cost from any network-side work.
