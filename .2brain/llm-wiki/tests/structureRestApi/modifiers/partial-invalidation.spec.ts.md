---
source: tests/structureRestApi/modifiers/partial-invalidation.spec.ts
sha256: 806ccd8a8db957c118e6d9c96262422aaa821e53169374d8b7c505bb3d376ea2
generated_at: 2026-09-28T22:56:36.598749+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/modifiers/partial-invalidation.spec.ts

## Purpose

Verifies the MODIFIER contract: a local write (partial list update, manual edit, optimistic mutation) must **not** clear a record's invalidated flag. Only a full server fetch should restore freshness. This guards against TanStack's `setQueryData` side-effect of resetting the "invalidated" state, which would cause the next `fetchTarget` to skip the server.

## Key elements

- **`describe('MODIFIER · local writes keep an invalidation')`** — the single test suite; all three cases share the pattern _fetch → invalidate → local write → assert still stale_.
- **Case 1: partial list write** — calls `c.fetchAll(..., { partial: true })` with a mutated record; asserts `checkTarget` is still `false` while `getRecord` reflects the new name.
- **Case 2: manual edit** — calls `c.editRecord({ name: 'Edited' }, 1)`; asserts `checkTarget` remains `false`.
- **Case 3: full fetch restores freshness** — re-calls `c.fetchTarget` with fresh server data; asserts `checkTarget` flips to `true` (positive control).
- **`afterEach(clearAllInstances)`** — tears down composable instances between tests.

## Relationships

- **`_helpers/harness.ts`** — imports `makeComposable` (instantiates a fresh composable under test) and `clearAllInstances` (global cleanup).
- **`_helpers/fakeApi.ts`** — imports `apiResolve` to wrap fixture data in a resolved Promise, simulating a server response without a network call.
- **`_helpers/fixtures.ts`** — imports the `FULL_USER` constant and the `IUser` type used to shape test data and generic parameters.

## Notes

- The `partial: true` option on `fetchAll` is what distinguishes a "local guess" write from a full authoritative list fetch; omitting it would likely clear invalidation (by design).
- `checkTarget(id)` is the freshness oracle: `false` means the record is still marked stale/invalidated and a future `fetchTarget` will hit the server.
- The file is intentionally narrow: it tests _one_ modifier behavior (invalidation preservation) and delegates all composable wiring to the harness, keeping the spec readable in isolation.
