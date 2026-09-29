---
source: tests/structureRestApi/unit/fetchMultiple.spec.ts
sha256: 5e75f247dbfda8bf5f7d58ec99d0662ec9aa8269e30354cee9c2c7c40783ada7
generated_at: 2026-09-28T23:02:29.590841+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/fetchMultiple.spec.ts

## Purpose

Unit tests for the `fetchMultiple` "batch by id" contract of the composable. Verifies the core behavioral promises: empty/undefined id short-circuits, cold-cache single-call fetch with caching, error propagation, merge-vs-replace semantics, freshness stamping, and that the API call receives only the ids it actually needs (missing or stale), never the full requested set.

## Key elements

- **`make()`** — local factory wrapping `makeComposable<IUser, number>()` to produce a fresh composable instance per test.
- **`describe('UNIT · fetchMultiple')`** — eight test cases covering:
    - Empty / undefined `ids` → resolves `[]`, zero API calls.
    - Cold cache → single API call, all requested ids fetched and stored.
    - API rejection → error re-thrown to caller.
    - `merge: true` → fetched fields overwrite, absent fields preserved.
    - Default (no merge) → fetched object replaces the cached record entirely.
    - Freshness stamp → a just-fetched id is served from cache on the immediate next call.
    - **Id filtering** — `apiCall`'s first argument equals only the missing/stale ids (matching `checkMultiple`'s `expiredIds`), not the full requested array.

## Relationships

- **`_helpers/harness.ts`** — supplies `makeComposable` (instantiates the composable under test) and `clearAllInstances` (used in `afterEach` to reset singleton state between tests).
- **`_helpers/fakeApi.ts`** — supplies `apiResolve(data)` and `apiReject(msg)` mock functions that stand in for the real API transport, letting tests assert call count and arguments.
- **`_helpers/fixtures.ts`** — supplies `USERS` (array of test user records), `FULL_USER` (a record with more fields than the minimal `IUser` shape), and the `IUser` type used in generics.

## Notes

- The file's header comment explicitly scopes itself to the _direct contract_ of `fetchMultiple`. Selective staleness ("only fetch expired ids") is tested separately in `staleTime/staleTime.multiple.spec.ts` and is intentionally excluded here.
- The merge and non-merge tests both pass `{ forced: true }` to bypass freshness checks, isolating the merge semantics from the cache layer.
- The last test ("apiCall receives only the missing/stale ids") is the critical integration point: it guards the invariant that a caller building `GET /users?ids=…` from the `apiCall` argument never over-fetches an id already fresh in the cache.
