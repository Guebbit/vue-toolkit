---
source: tests/structureRestApi/unit/fetchAll.spec.ts
sha256: 09727ce10eafb690be955c5df013ef0c7512b7088cd7d4c37876b045a9e5a559
generated_at: 2026-09-28T23:01:34.518008+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/fetchAll.spec.ts

## Purpose

Unit tests that pin down the direct contract of the `fetchAll` method on the composable: it resolves the item list, persists each entry into the internal dictionary by id, populates `itemList`, skips `undefined` entries, tolerates an empty array, and re-throws on network errors while preserving previously stored data. Caching, merge, partial, and forced-fetch behavior is deliberately out of scope here (covered under `staleTime/` and `modifiers/`).

## Key elements

- **`describe('UNIT · fetchAll')`** – the single test suite; six `it` blocks covering the behaviours listed above.
- **`make()`** – one-liner that calls `makeComposable<IUser, number>()` to get a fresh composable instance per test.
- **`afterEach(clearAllInstances)`** – tears down all composable instances between tests to prevent state leakage.
- **Test cases** – resolve shape, dictionary storage (`getRecord(id)`), `itemList` length, `undefined`-entry filtering, empty-list handling, and error re-throw with data integrity.

## Relationships

- **`../_helpers/harness.ts`** – supplies `makeComposable` (creates the composable under test) and `clearAllInstances` (global teardown).
- **`../_helpers/fakeApi.ts`** – supplies `apiResolve` / `apiReject`, which wrap values in `Promise.resolve` / a rejecting `Promise` to simulate the API boundary without a real HTTP layer.
- **`../_helpers/fixtures.ts`** – supplies the `USERS` array and the `IUser` type used as the composable's item generic.

## Notes

- The top-of-file comment explicitly carves out scope: staleTime, merge, partial, and `forced` flag scenarios live in sibling directories (`staleTime/`, `modifiers/`), not here.
- The error test passes `{ forced: true }` to the second `fetchAll` call to bypass any cache so the rejection actually reaches the method; this is the only use of an option object in the file.
