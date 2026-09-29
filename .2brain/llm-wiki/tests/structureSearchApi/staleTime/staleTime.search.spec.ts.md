---
source: tests/structureSearchApi/staleTime/staleTime.search.spec.ts
sha256: 2b168c9422d7b3eec60d6c6623af379daa6ab4a1a5f874cab473c0ebcc195c2b
generated_at: 2026-09-28T23:12:49.620360+00:00
model: ollama:qwen3.8:27b
---

# tests/structureSearchApi/staleTime/staleTime.search.spec.ts

## Purpose

Verifies that the `fetchSearch` method honours its `staleTime` configuration: a repeat request with identical filters, page, and pageSize is served from cache when it arrives within the window, but triggers a fresh API call once the window has elapsed.

## Key elements

- **`STALE_TIME` (10 000 ms)** – Fixed freshness window used by both test cases.
- **`make()`** – Shorthand that calls `makeSearchComposable<IArticle, number>({ staleTime: STALE_TIME })`, returning a fresh composable instance for each test.
- **`beforeEach` / `afterEach` hooks** – Install a fake clock before each test; clean up composable instances (`clearAllInstances`) and restore the real clock after.
- **"VALID just under staleTime → served from cache"** – Calls `fetchSearch`, advances the clock by `STALE_TIME − 1`, calls again, and asserts the second mock resolver was _not_ invoked.
- **"STALE past staleTime → API called again"** – Same setup but advances by `STALE_TIME + 1`; asserts the second resolver was called exactly once.

## Relationships

- **`tests/structureSearchApi/_helpers/harness.ts`** – Supplies `makeSearchComposable` (builds the SUT with injectable API) and `clearAllInstances` (teardown).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** – Supplies `apiResolve`, a recording mock that captures call arguments so tests can assert whether the API was hit.
- **`tests/structureRestApi/_helpers/fixtures.ts`** – Supplies `buildArticles` (deterministic `IArticle[]` payload) and the `IArticle` type.
- **`tests/structureRestApi/_helpers/time.ts`** – Supplies `useFakeClock`, `advance`, and `restoreClock` to control time deterministically instead of using real timers.

## Notes

- Time control is entirely fake-clock based; no `setTimeout`/`Date.now` races. If `advance` or the clock helpers change, both tests break.
- The two cases deliberately test `STALE_TIME − 1` and `STALE_TIME + 1`, skipping the exact boundary value (`=== STALE_TIME`). The boundary semantics are therefore untested here.
- `clearAllInstances()` in `afterEach` implies the harness keeps a global registry of live composable instances; forgetting it would leak state between tests.
