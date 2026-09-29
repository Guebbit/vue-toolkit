---
source: tests/structureRestApi/staleTime/staleTime.get.spec.ts
sha256: 0b83dcc3f3cce76b19c670ad44489e68e57d78d3c30038ebb8a073872439dcad
generated_at: 2026-09-28T22:58:57.084053+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/staleTime/staleTime.get.spec.ts

## Purpose

Verifies that the composable's three GET-like fetch methods (`fetchAll`, `fetchTarget`, `fetchByParent`) respect the `staleTime` window: data is served from cache when elapsed time is under the threshold and re-fetched when it is past. Also exercises the per-call `staleTime` override, which can shorten or extend that window independently of the composable-level setting.

## Key elements

- **`STALE_TIME`** (10 000 ms) — default window used by the `make()` helper.
- **`make(staleTime?)`** — shorthand for `makeComposable<IUser, number>({ staleTime })`; returns a fresh composable instance for each test.
- **`beforeEach` / `afterEach`** — install a fake clock before every test; call `clearAllInstances()` and `restoreClock()` after, ensuring no cross-test state.
- **`describe('staleTime · fetchAll' / 'fetchTarget' / 'fetchByParent')`** — each contains a **VALID** case (advance `STALE_TIME - 1`, assert second mock _not_ called) and a **STALE** case (advance `STALE_TIME + 1`, assert second mock _called once_).
- **`describe('staleTime · per-call override')`** — two cases: a short per-call `staleTime` (5 s) that expires faster than the composable's 1-hour window, and a long per-call `staleTime` (60 s) that keeps data valid beyond the composable's 1-second window. Both use `fetchAll`.

## Relationships

- **`_helpers/harness.ts`** — `makeComposable` builds the SUT; `clearAllInstances` tears down between tests.
- **`_helpers/fakeApi.ts`** — `apiResolve(payload)` returns a jest-mocked async function that resolves with the given data; tests inspect its call count to prove cache hit vs. miss.
- **`_helpers/fixtures.ts`** — `USERS` (array), `buildUsers(count, parentId)` (children array), and `IUser` type supply realistic payload shapes.
- **`_helpers/time.ts`** — `useFakeClock` / `advance(ms)` / `restoreClock` drive deterministic time without real waiting.

## Notes

- Boundary is tested at `STALE_TIME − 1` and `STALE_TIME + 1`; the exact `STALE_TIME` tick is not explicitly asserted (implementation detail of whether the boundary is inclusive).
- Per-call override coverage exists only for `fetchAll`; `fetchTarget` and `fetchByParent` are not exercised with an inline `staleTime` option here.
- The `second` mock in each test is the detection mechanism: if it is never called, the composable returned the cached value; if it is called once, a fresh API round-trip occurred.
