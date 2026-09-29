---
source: tests/structureRestApi/staleTime/staleTime.multiple.spec.ts
sha256: 397161099c8585a555e1a5cd323830a624bb45b38e72d793e71d2ab1cbc6c3a2
generated_at: 2026-09-28T22:59:12.848318+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/staleTime/staleTime.multiple.spec.ts

## Purpose

Verifies that `fetchMultiple` applies per-id freshness: only stale ids trigger a network batch call while still-fresh ids are served from the local cache. Three scenarios cover the all-fresh, all-stale, and mixed-freshness cases.

## Key elements

- **`STALE_TIME`** — 10 000 ms constant used for every composable instance in this suite.
- **`make()`** — factory that returns a fresh `makeComposable<IUser, number>` with the fixed `staleTime`.
- **`describe('staleTime · fetchMultiple')`** — three `it` blocks:
    - _ALL fresh_ — both ids primed, clock advanced to `STALE_TIME - 1`; asserts the batch mock is **not** called and the result has length 2.
    - _ALL stale_ — both ids primed, clock advanced to `STALE_TIME + 1`; asserts the batch mock is called exactly once.
    - _MIXED_ — id 1 primed at t0, id 2 primed at t6000, then advanced to t12000; asserts the batch mock (which only receives the stale id) is called once and both users appear in the result.

## Relationships

- **`_helpers/harness.ts`** — supplies `makeComposable` (the composable under test) and `clearAllInstances` (teardown in `afterEach`).
- **`_helpers/fakeApi.ts`** — supplies `apiResolve`, used to create mock API functions for both single-target fetches and the batch endpoint.
- **`_helpers/fixtures.ts`** — supplies the `USERS` array and the `IUser` type used as the composable's value type.
- **`_helpers/time.ts`** — supplies `useFakeClock`, `advance`, and `restoreClock` to deterministically control when ids cross the stale threshold.

## Notes

- The mixed test's batch mock is `apiResolve([USERS[0]])` — it intentionally contains **only** the stale id. This asserts the composable narrows the batch to stale ids before invoking the caller-supplied API; it does not test what happens if the caller passes all ids to the mock.
- Boundary assertions use `STALE_TIME - 1` (fresh) and `STALE_TIME + 1` (stale) but never `STALE_TIME` itself; the exact-equality edge is not covered here.
- `beforeEach` installs the fake clock globally; `afterEach` both clears composable instances **and** restores the real clock — both are required to avoid cross-test contamination.
