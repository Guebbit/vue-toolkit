---
source: tests/structureRestApi/unit/loading.spec.ts
sha256: 56325aacf1be880a403e2fc39dbd9ee61a721e4c9dbf9390720c0c2f64b5b218
generated_at: 2026-09-28T23:04:40.658116+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/loading.spec.ts

## Purpose

Unit tests for the `isLoading()` loading primitive on the composable API. Verifies that `isLoading()` (no args) and `isLoading(key)` correctly reflect in-flight queries and mutations by segment-prefix matching, and that they reset to `false` once the underlying call settles. Concurrency/ref-counting and rejection-path behaviour are deliberately excluded (see `modifiers/loading.spec.ts`).

## Key elements

- **`make()`** – Local factory that calls `makeComposable<IUser, number>()` to produce a fresh composable under test.
- **`afterEach(clearAllInstances)`** – Tears down every composable instance between tests to prevent cross-test leakage.
- **"is false initially"** – Confirms `c.isLoading()` returns `false` before any call is issued.
- **"is true during a fetch and false after it resolves"** – Wraps a `fetchAll` call in a `jest.fn` to snapshot `isLoading()` mid-flight, then asserts it is `true` during and `false` after resolution.
- **"isLoading(key) only matches calls tagged with that key"** – Uses `fetchAny` with `{ key: ['report'] }` to confirm the tagged key reports `true` while an unrelated key reports `false`.
- **`describe.each` prefix-semantics block** – Runs the same assertions against both `fetchAny` (query) and `mutateAny` (mutation) with key `['dash','w1']`, using `deferredApi` to hold the promise open. Asserts that `['dash']` and `['dash','w1']` match, while `['dash','w2']`, `['w1']`, and `['dash','w1','extra']` do not.

## Relationships

- **`_helpers/harness.ts`** – Source of `makeComposable` (constructs the composable under test) and `clearAllInstances` (global teardown).
- **`_helpers/fakeApi.ts`** – Provides `deferredApi<T>()`, which returns a `{ call, control }` pair so a promise can be held pending and resolved at a precise assertion point.
- **`_helpers/fixtures.ts`** – Supplies the `USERS` array and the `IUser` type used as the composable's generic parameters and as resolved data for `fetchAll`.

## Notes

- Key matching is **prefix-of-segments**, not exact match and not substring: `['dash']` matches a call keyed `['dash','w1']`, but `['w1']` does not (it is a trailing segment, not a prefix).
- The rejection / concurrent-ref-counting scenarios are intentionally **not** in this file; they live in `tests/structureRestApi/unit/modifiers/loading.spec.ts`. Keep new edge-case tests there to avoid duplicating setup.
- `describe.each` is used so the same prefix-logic assertions run identically for both the query (`fetchAny`) and mutation (`mutateAny`) code paths without duplication.
