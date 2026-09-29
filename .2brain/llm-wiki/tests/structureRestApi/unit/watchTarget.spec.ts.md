---
source: tests/structureRestApi/unit/watchTarget.spec.ts
sha256: 38888ba5d1eb14da9972166da204e351b465e5e585196b0f2f29e878a8c0ca74
generated_at: 2026-09-28T23:07:33.329093+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/watchTarget.spec.ts

## Purpose

Unit tests for the `watchTarget` composable — the reactive (ref-driven) counterpart to `fetchTarget`. Verifies its reactive contract: immediate fire, eager selection, refetch on id change, nullish-id no-op semantics, callback signatures, and error-handling edge cases (stale-data retention on failed refetch, isolated idle placeholder).

## Key elements

- **`make`** — shorthand for `makeComposable<IUser, number>()`; produces a fresh composable instance per test.
- **`fakeApiCall`** — returns a `jest.fn` that resolves a user from the `USERS` fixture by id.
- **`anyContext`** — `expect.objectContaining({ signal: expect.any(AbortSignal) })`; matches the trailing context argument `apiCall` receives.
- **`afterEach(clearAllInstances)`** — global teardown so tests don't leak composable instances.
- **Test cases** (9 `it` blocks under `describe('UNIT · watchTarget')`):
    - Immediate fire + selection for a present id.
    - Synchronous (eager) `selectedIdentifier` before the promise resolves.
    - Refetch + re-select when `id.value` changes.
    - Nullish id: no additional fetch, previous selection untouched.
    - Idle-placeholder isolation — a watcher with no id does not share its cache slot with a `fetchAny` key spelled `['idle']`.
    - `onSuccess` / `onSettled` called with correct `(item, error, id)` tuples.
    - Rejected fetch with **no** callbacks: error swallowed, selection cleared.
    - Failed `handle.refetch()` on an already-cached record: stale data and selection **retained**, `handle.error` populated.
    - Rejected fetch **with** callbacks: `onError` / `onSettled` fire, `onSuccess` does not, no selection made.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** — provides `makeComposable` (factory under test), `clearAllInstances` (teardown), and `flush` (microtask drain). Every test drives the composable through these.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — supplies `USERS` (the mock data `fakeApiCall` resolves) and the `IUser` type used in the composable generic.
- **`package.json`** — declares the Jest test runner, `vue` dependency (for `ref`), and the project's module/type configuration that this test relies on.

## Notes

- The file explicitly states the shared handle contract (e.g., `stop`, `refetch` lifecycle) is covered in a sibling `watchers.spec.ts`; this file only tests `watchTarget`-specific reactive behavior.
- The "idle placeholder" test encodes a non-obvious invariant: the internal idle key is a three-part tuple `[rk, 'idle', scope]` and cannot collide with a user-supplied two-part key like `['idle']`.
- The failed-refetch test calls `handle.refetch()` directly (not by mutating the id ref) to isolate the "background refetch keeps stale data" path.
- `stop()` is called in every passing test body (not just in `afterEach`) to release the watcher before the harness teardown, mirroring the contract under test.
