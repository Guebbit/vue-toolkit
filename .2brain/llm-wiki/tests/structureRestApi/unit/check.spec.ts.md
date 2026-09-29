---
source: tests/structureRestApi/unit/check.spec.ts
sha256: 62ce76ad9229c44bc8721e09609eec4419f40480251380b9d45b38e9ed5f818e
generated_at: 2026-09-28T23:00:14.741429+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/check.spec.ts

## Purpose

Unit tests for the pre-flight freshness-check methods (`checkTarget`, `checkAll`, `checkByParent`, `checkAny`, `checkPaginate`, `checkMultiple`). Each check reports whether a corresponding `fetch*` call has already primed the cache for a given query key. The file verifies three invariants: cold cache returns `false`, a matching prior fetch flips it to `true`, and a _different_ key (id, parentId, page, key array) never cross-reports another cache slot.

## Key elements

- **`make()`** – local factory wrapping `makeComposable<IUser, number>()`; creates a fresh composable instance per test.
- **`describe('UNIT · checkTarget')`** – verifies per-id freshness: cold → `false`, after `fetchTarget(id)` → `true`, different id stays `false`.
- **`describe('UNIT · checkAll')`** – verifies the no-arg "fetch all" cache slot.
- **`describe('UNIT · checkByParent')`** – verifies parent-scoped freshness; asserts that only the matching `parentId` flips to `true`.
- **`describe('UNIT · checkAny')`** – two cases: without a key the check is always `false` (because `fetchAny` without a key never caches); with a key array it behaves like a normal slot.
- **`describe('UNIT · checkPaginate')`** – verifies page/pageSize as the cache discriminator; a different page number yields `false`.
- **`describe('UNIT · checkMultiple')`** – batch check returning `{ cachedIds, expiredIds }`; covers cold cache, partial priming, and empty input.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** – provides `makeComposable` (builds the composable under test with a mockable API layer) and `clearAllInstances` (used in `afterEach` to reset state between tests).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** – provides `apiResolve`, which wraps a resolved value in the fake-API shape expected by `fetch*` methods.
- **`tests/structureRestApi/_helpers/fixtures.ts`** – provides `USERS` (static user array), `buildUsers(count, parentId)` (generates synthetic users), and the `IUser` type used for the composable's generics.

## Notes

- `checkSearch` is **not** tested here; it lives in `tests/structureSearchApi/unit/checkSearch.spec.ts`.
- The `staleTime` boundary (true just under, false just past) is intentionally out of scope and tested in `staleTime/staleTime.check.spec.ts`.
- `checkAny` without a key argument always returns `false` by contract — `fetchAny` in that form does not write to the cache.
- `checkMultiple` returns an object (`{ cachedIds, expiredIds }`) rather than a boolean, making it the only check with a composite return shape.
