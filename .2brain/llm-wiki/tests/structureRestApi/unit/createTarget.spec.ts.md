---
source: tests/structureRestApi/unit/createTarget.spec.ts
sha256: 911223710b542db04296a69b2cbeb2cfec74b1abd3675cc89b9a8416b19e7fc4
generated_at: 2026-09-28T23:00:39.734087+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/createTarget.spec.ts

## Purpose

Unit tests for the `createTarget` method of a generic composable, verifying its optimistic-create contract: resolving with the created item, handling an `undefined` API response, swapping a caller-supplied placeholder with the real record on success, rolling the placeholder back on failure, and updating `lastInsertedIdentifier` / `lastInsertedRecord`.

## Key elements

- **`make()`** — local factory that calls `makeComposable<IUser, number>()` to produce a fresh composable instance per test.
- **`DAVE`** — a concrete `IUser` fixture (`id: 4`) used as the "server-returned" record.
- **`afterEach(clearAllInstances)`** — ensures every composable instance is torn down between tests.
- **Five test cases** inside `describe('UNIT · createTarget')`:
    - Resolves with the created item and stores it in the record map.
    - Resolves `undefined` when the API promise resolves with no value.
    - Replaces a dummy placeholder (e.g. `id: -1, name: 'Loading...'`) with the real item in `itemList`.
    - Removes the dummy from `itemList` when the API rejects.
    - Sets `lastInsertedIdentifier.value` and `lastInsertedRecord.value` to the newly created item.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** — source of `makeComposable` (generic composable constructor) and `clearAllInstances` (teardown used in `afterEach`).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — source of `apiResolve` / `apiReject`, which simulate successful and failed API calls so the composable's promise-handling path can be exercised without a real backend.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — source of the `IUser` type that parameterises the composable and shapes the test data.

## Notes

- `apiResolve()` with **no argument** (as opposed to `apiResolve(DAVE)`) is the way to simulate the API returning `undefined`; it is distinct from `apiReject()`.
- The optimistic pattern under test: `createTarget` accepts an optional second argument (the placeholder). On success the placeholder is replaced; on rejection it is removed entirely (list length returns to `0`).
- The composable is generic over record type and ID type (`<IUser, number>`); tests only exercise the `IUser`/`number` instantiation.
