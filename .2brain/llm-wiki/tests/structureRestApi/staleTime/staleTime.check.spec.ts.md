---
source: tests/structureRestApi/staleTime/staleTime.check.spec.ts
sha256: a1effa22a7caca866376f5033afa729a5b699a4cbfed6cf03fc65b1a0dd53757
generated_at: 2026-09-28T22:58:24.768816+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/staleTime/staleTime.check.spec.ts

## Purpose

Verifies that the pre-flight `check*` methods (`checkTarget`, `checkAll`, `checkByParent`, `checkMultiple`) report the same stale boundary as their `fetch*` counterparts: data just under `staleTime` is still valid (cache would be reused), data just past it is stale (fetch would hit the network). Also covers the per-call `staleTime` override on check methods.

## Key elements

- **`make(staleTime)`** — local factory that calls `makeComposable<IUser, number>` with the given `staleTime` (default `10_000`).
- **`beforeEach` / `afterEach`** — activates the fake clock, clears all composable instances, and restores the real clock after each test.
- **`describe('staleTime · checkTarget')`** — asserts `checkTarget(id)` returns `true` at `STALE_TIME − 1` ms and `false` at `STALE_TIME + 1` ms after a `fetchTarget` call.
- **`describe('staleTime · checkAll')`** — same valid/stale boundary test for `checkAll()` after `fetchAll`.
- **`describe('staleTime · checkByParent')`** — same boundary test for `checkByParent('team-1')` after `fetchByParent`.
- **`describe('staleTime · checkMultiple')`** — primes two IDs at different times (t0 and t6000), advances to t12000, and asserts the mixed result `{ cachedIds: [2], expiredIds: [1] }`.
- **`describe('staleTime · check per-call override')`** — confirms a per-call `staleTime` shorter than the composable default forces an earlier stale report, and a longer one delays it.

## Relationships

- **`_helpers/harness.ts`** — supplies `makeComposable` (builds the Svelte composable under test) and `clearAllInstances` (teardown).
- **`_helpers/fakeApi.ts`** — `apiResolve` wraps plain data into a fake API response so `fetch*` methods can be called without a real network.
- **`_helpers/fixtures.ts`** — provides `USERS` array, `buildUsers(count, parent)` generator, and the `IUser` type used by the composable.
- **`_helpers/time.ts`** — `useFakeClock` / `advance` / `restoreClock` let tests deterministically step the clock past or up to the stale boundary.

## Notes

- The stale boundary is tested at exactly `±1 ms` around `STALE_TIME` (10 000 ms); the assertion is binary (`toBe(true)` / `toBe(false)`), so any off-by-one in the boundary logic will be caught.
- The per-call override tests deliberately set the composable default to a _different_ value (1 h or 1 s) than the per-call value (5 s or 60 s) to prove the per-call value wins in both directions.
- `checkSearch` staleTime behaviour is intentionally **not** covered here; it lives in `tests/structureSearchApi/staleTime/staleTime.check.spec.ts`.
