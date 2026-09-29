---
source: tests/structureRestApi/unit/setRecords.spec.ts
sha256: af7f33fa6bdf4786d682aa53187d33e1cd139290a90db93a7bb7076a26b7d864
generated_at: 2026-09-28T23:06:05.662471+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/setRecords.spec.ts

## Purpose

Unit tests for the `setRecords` / `resetRecords` escape-hatch methods on the composable record store. These methods bypass the REST fetch machinery entirely, writing directly into the internal dictionary. The suite verifies replacement semantics, the "local guess" (stale) freshness stamping applied to manually written records, and the deliberate scope difference between `resetRecords` and `resetAll`.

## Key elements

- **`dictOf(...items: IUser[])`** — local helper that bracket-assigns items into a `Record<number, IUser>`; exists because a numeric-keyed object _literal_ triggers a naming-convention lint rule.
- **`make()`** — one-liner alias for `makeComposable<IUser, number>()`, used at the top of every test.
- **`describe('UNIT · setRecords / resetRecords')`** — six `it` blocks covering:
    - Direct write and identity return.
    - Replacement semantics (ids absent from the new set are gone).
    - Manually-set records remain stale (subsequent `fetchTarget` still fires the API).
    - Contrasting freshness: `fetchAll` stamps fresh; `addRecord` / `editRecord` do not.
    - `resetRecords` empties the dictionary.
    - `resetRecords` is _narrower_ than `resetAll`: the list-level cached id list survives in the query client but is marked stale (`checkAll()` → `false`).

## Relationships

- **`_helpers/harness.ts`** — supplies `makeComposable` (the factory under test) and `clearAllInstances` (called in `afterEach` to tear down state between tests).
- **`_helpers/fakeApi.ts`** — supplies `apiResolve`, a mock that resolves an API response without a network call; used wherever a test needs to seed fetched data.
- **`_helpers/fixtures.ts`** — supplies the `USERS` fixture array and the `IUser` type used throughout the suite.

## Notes

- `resetRecords` ≠ `resetAll`: it clears only the record dictionary. The list-level query (e.g. `fetchAll`'s cached id list) remains in the query client but is flagged stale, so the next read will trigger a refetch. Tests assert both conditions explicitly.
- The "local guess" concept: any record written via `setRecords`, `addRecord`, or `editRecord` is stamped as _not fresh_, meaning subsequent targeted fetches will hit the network. Only records arriving through the fetch pipeline (`fetchAll`, `fetchTarget`) are stamped fresh.
- `clearAllInstances` in `afterEach` is critical; without it, composable state (including the query client) leaks between tests.
