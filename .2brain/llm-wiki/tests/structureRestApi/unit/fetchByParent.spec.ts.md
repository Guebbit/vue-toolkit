---
source: tests/structureRestApi/unit/fetchByParent.spec.ts
sha256: 983f8c3c46b0b42414dfa65ab76d3d96429d448c74aa77cdd57bda87626e49ea
generated_at: 2026-09-28T23:02:01.527827+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/fetchByParent.spec.ts

## Purpose

Unit test suite that pins down the direct contract of the composable's `fetchByParent` method: it must resolve items, store them, link them to the given parent, keep different parents isolated, skip `undefined` entries, and re-throw on API failure.

## Key elements

- **`make()`** — local factory that calls `makeComposable<IUser, number>()` to produce a fresh composable instance for each test.
- **`describe('UNIT · fetchByParent')`** — five `it` blocks covering:
    - Resolves with items and links them to the parent (`getListByParent`).
    - Stores each item in the internal dictionary (`getRecord`).
    - Keeps children of different parents in separate lists.
    - Filters out `undefined` entries before storing.
    - Re-throws the rejection reason (`'network error'`) when the API call fails.
- **`afterEach(clearAllInstances)`** — resets all composable singleton state between tests.

## Relationships

- **`../_helpers/harness.ts`** — supplies `makeComposable` (the composable under test) and `clearAllInstances` (teardown).
- **`../_helpers/fakeApi.ts`** — supplies `apiResolve` / `apiReject`, which stand in for a real API promise so the test exercises the composable's handling logic without network I/O.
- **`../_helpers/fixtures.ts`** — supplies `buildUsers(n, id)` to generate typed `IUser` arrays and the `IUser` type used as the composable's entity parameter.

## Notes

- The second generic parameter of `makeComposable` is the **ID type** (`number` here), not the parent-key type (a string like `'team-1'`).
- `apiReject()` always rejects with the message `'network error'`; the test asserts on that exact string.
- The suite is purely unit-level: no HTTP mocking, no real `fetch` — the composable receives an already-resolved/rejected promise.
