---
source: tests/structureRestApi/staleTime/staleTime.search.spec.ts
sha256: adcfb2f8427a2e9ce0f6f3f651978d55cb403fec82154568e48456e5a6ddc90c
generated_at: 2026-09-28T22:59:45.003190+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/staleTime/staleTime.search.spec.ts

## Purpose

Verifies that `fetchPaginate` respects the `staleTime` option: calls made within the window are served from cache (no second API hit), while calls made after the window elapses trigger a fresh API request. It isolates timing by driving a fake clock.

## Key elements

- **`STALE_TIME`** — constant set to `10_000` ms; the value passed as the composable's `staleTime` option.
- **`makeProducts()`** — local factory wrapping `makeComposable<IProduct, number>({ staleTime: STALE_TIME })`; produces a fresh composable instance for each test.
- **`beforeEach` / `afterEach`** — activate a fake clock, then clear all composable instances and restore the real clock after each test to prevent cross-test contamination.
- **Test: "VALID just under staleTime"** — calls `fetchPaginate` twice with the same page/pageSize, advancing `STALE_TIME − 1` ms between calls; asserts the second mock API was **not** invoked.
- **Test: "STALE past staleTime"** — identical setup but advances `STALE_TIME + 1` ms; asserts the second mock API **was** invoked once.

## Relationships

- **`_helpers/harness.ts`** — supplies `makeComposable` (to instantiate the composable under test) and `clearAllInstances` (teardown).
- **`_helpers/fakeApi.ts`** — supplies `apiResolve`, used to create the mock API response objects that `fetchPaginate` receives (and whose call count is asserted).
- **`_helpers/fixtures.ts`** — supplies `buildProducts` (generates a standard page of products for the mock) and the `IProduct` type.
- **`_helpers/time.ts`** — supplies `useFakeClock`, `advance`, and `restoreClock` to deterministically control elapsed time.

## Notes

- The file's header comment explicitly states that `fetchSearch`'s staleTime behaviour is covered in a **different** spec under `tests/structureSearchApi/`, to avoid confusion about scope.
- Boundary checks use `±1` ms around `STALE_TIME` rather than exact equality, so the tests exercise the strict `<` vs `≥` comparison without flakiness.
- The second `apiResolve(...)` argument is a stand-in spy: the test asserts on its call count to prove (or disprove) that `fetchPaginate` re-invoked the API.
