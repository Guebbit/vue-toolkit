---
source: tests/structureSearchApi/staleTime/staleTime.check.spec.ts
sha256: bd5e12dd94f935b9933962257cace327a9a29c6863cbdbba368c04238c67c270
generated_at: 2026-09-28T23:12:33.593668+00:00
model: ollama:qwen3.8:27b
---

# tests/structureSearchApi/staleTime/staleTime.check.spec.ts

## Purpose

Verifies that `checkSearch` reports the correct stale/valid boundary relative to the `staleTime` option: it must return `true` just under the threshold (cache is still fresh) and `false` just past it (cache is expired and a network fetch would occur).

## Key elements

- **`STALE_TIME` (10 000 ms)** – default stale window shared by both tests.
- **`make(staleTime?)`** – thin wrapper around `makeSearchComposable<IUser, number>` that injects the staleTime option.
- **"VALID just under staleTime → true"** – primes the cache via `fetchSearch`, advances the fake clock by `STALE_TIME − 1` ms, then asserts `checkSearch` returns `true`.
- **"STALE past staleTime → false"** – same setup but advances by `STALE_TIME + 1` ms; asserts `checkSearch` returns `false`.
- **`beforeEach` / `afterEach` hooks** – installs a fake clock before each test and calls `clearAllInstances()` + `restoreClock()` afterwards.

## Relationships

- **`tests/structureSearchApi/_helpers/harness.ts`** – supplies `makeSearchComposable` (the composable under test) and `clearAllInstances` (teardown).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** – supplies `apiResolve`, used to produce a resolved API response without a real network call.
- **`tests/structureRestApi/_helpers/fixtures.ts`** – supplies the `IUser` type used as the item-generic in the composable and as the cast target for the one-item fixture.
- **`tests/structureRestApi/_helpers/time.ts`** – supplies `useFakeClock`, `advance`, and `restoreClock` for deterministic time control.

## Notes

- Tests use ±1 ms around the boundary to exercise the exact transition; no tolerance or epsilon is involved.
- `IUser` is constructed as a bare `{ id: 1 }` cast, so the test is type-level only — the shape of the user object is irrelevant to the staleness logic.
- The composable is generic over `<IUser, number>` (item type, page type); changing either does not affect what these tests assert.
