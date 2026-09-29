---
source: tests/structureRestApi/unit/fetchTarget.spec.ts
sha256: e8a4966a640e8ca2cf19c05bea9b3c011a3ddcc1c882addb04e76cbe3dd9573f
generated_at: 2026-09-28T23:02:52.456013+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/fetchTarget.spec.ts

## Purpose

Unit tests verifying the direct contract of the composable's `fetchTarget` method (the "single item" fetch). Covers resolution, undefined-when-missing, the id-less code path, error re-throwing, and an explicit guard that fetching does not pollute `lastInsertedIdentifier`.

## Key elements

- **`describe('UNIT · fetchTarget')`** — the single suite; all tests operate on a fresh composable built by the `make()` helper.
- **`make()`** — local factory that calls `makeComposable<IUser, number>()` for each test.
- **Test: "resolves with the fetched item and stores it"** — asserts both the return value and `getRecord(id)` match the fixture.
- **Test: "resolves undefined … (id given)"** — API returns `undefined` with an explicit id (`99`); verifies no record is stored.
- **Test: "runs and stores the item when no id is given"** — id omitted; the item's own `id` (from `USERS[0]`) is used for storage.
- **Test: "resolves undefined … and no id is given"** — both API result and id are `undefined`.
- **Test: "re-throws on error"** — uses `apiReject()` and asserts the rejection propagates with the original message.
- **Test: "does not mark a fetched record as lastInsertedIdentifier"** — guards against a fetch path inadvertently setting the insert-tracking field.

## Relationships

- **`_helpers/harness.ts`** — provides `makeComposable` (constructs the SUT under test) and `clearAllInstances` (called in `afterEach` to reset singleton state between tests).
- **`_helpers/fakeApi.ts`** — provides `apiResolve(value?)` and `apiReject()` to inject deterministic Promise results into the composable's API dependency.
- **`_helpers/fixtures.ts`** — supplies the `USERS` array and the `IUser` type used to parameterize the composable and assert on returned/stored data.

## Notes

- The id-less path (no second argument to `fetchTarget`) still stores the record under the item's intrinsic `id` (`USERS[0].id === 1`); the test asserts `getRecord(1)`, not `getRecord(undefined)`.
- The `lastInsertedIdentifier` guard is an intentional contract check: fetching is _read_-only and must not be conflated with an insert/mutation path.
- `afterEach(clearAllInstances)` ensures no singleton leakage between tests; do not remove without verifying no other suite relies on shared state.
