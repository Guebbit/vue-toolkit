---
source: tests/structureRestApi/staleTime/staleTime.mutations.spec.ts
sha256: 81a9c1434ca89ba66a5c2224515d0609716da99dd4810695264a94cb99e45cc9
generated_at: 2026-09-28T22:59:30.915800+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/staleTime/staleTime.mutations.spec.ts

## Purpose

Verifies the freshness contract for the three mutation paths (`createTarget`, `updateTarget`, `deleteTarget`) under a fixed `staleTime`. Each describe block asserts a specific freshness side-effect: create seeds a fresh entry, update resets the stale clock, and delete invalidates the entry immediately. The tests use a fake clock so timing is deterministic and repeatable.

## Key elements

- **`STALE_TIME` (10 000 ms)** — the single freshness window under test; kept as a module-level constant so every assertion references the same value.
- **`make()`** — factory that calls `makeComposable<IUser, number>` with `staleTime: STALE_TIME`, giving each test an isolated composable instance.
- **`DAVE`** — a one-off `IUser` fixture used only by the create-target tests (avoids coupling to the shared `USERS` array for the "new record" scenarios).
- **`describe('staleTime · createTarget seeds freshness')`** — two cases: fetch within `staleTime` after create is a cache hit (no API call); fetch past `staleTime` refetches.
- **`describe('staleTime · updateTarget resets the stale clock')`** — primes at t0, updates at t+8 s, fetches at t+16 s; asserts no refetch because age-since-refresh (8 s) < staleTime.
- **`describe('staleTime · deleteTarget invalidates immediately')`** — fetches, deletes, fetches again with **zero** time advanced; asserts the API is called because the entry is gone.
- **`beforeEach` / `afterEach` hooks** — install a fake clock and tear down all composable instances + restore the real clock between tests.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** — supplies `makeComposable` (the SUT factory) and `clearAllInstances` (called in `afterEach` to prevent state leaking between tests).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — supplies `apiResolve`, which both seeds data into the fake backend and doubles as a Jest mock (assertions like `expect(get).not.toHaveBeenCalled()` rely on its spy behaviour).
- **`tests/structureRestApi/_helpers/fixtures.ts`** — provides the `USERS` array and the `IUser` type used throughout.
- **`tests/structureRestApi/_helpers/time.ts`** — provides `useFakeClock`, `advance`, and `restoreClock`; every timing assertion in this file depends on `advance` to simulate elapsed milliseconds without real waiting.

## Notes

- `apiResolve` is used dually: once as the data payload passed to mutations, and once as the spy passed to `fetchTarget`. The same call returns an object that is both the resolved value and a Jest mock function.
- The delete test deliberately does **not** call `advance` — the point is that invalidation is immediate, not time-dependent.
- `clearAllInstances()` in `afterEach` is required because `makeComposable` may register module-level state; without it, a stale entry from one test could mask a missing one in the next.
