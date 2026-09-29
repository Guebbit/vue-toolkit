---
source: tests/structureRestApi/lifecycle/maxRecords-crossing.spec.ts
sha256: 841193bae81151857c3e93eedb87a92d710967c09374e86368191fcaec5b261a
generated_at: 2026-09-28T22:52:46.392784+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/lifecycle/maxRecords-crossing.spec.ts

## Purpose

Verifies the lifecycle behavior when a single fetch exceeds the composable's `maxRecords` bound: the crossing write must survive the scope wipe it triggers, and only _new_ records count toward the bound. Without this guarantee the triggering call would cancel itself and resolve `[]` with an empty cache.

## Key elements

- **`describe('LIFECYCLE · crossing maxRecords')`**
    - _crossing `fetchAll` resolves its items and caches its list_ — seeds a scope under key `'a'`, then `fetchAll` under key `'b'` returns more items than `maxRecords`. Asserts: the crossing result is returned, its list is cached, the _other_ key's list is wiped (`undefined`), and the item dictionary contains only the new items.
    - _`fetchMultiple` enforces the bound too_ — seeds 3 records (at the bound), then `fetchMultiple` adds 2 more. Asserts the result and that the dictionary contains only the new ids.
- **`describe('LIFECYCLE · maxRecords counts only new records')`**
    - _refetching a list bigger than half the bound does not wipe the scope_ — with `maxRecords: 5`, refetches 3 already-cached records with `forced: true`. Asserts the second list (key `'b'`) is **not** wiped and the total item list length stays at 5, confirming existing records are excluded from the bound calculation.
- **`afterEach(clearAllInstances)`** — resets all composable instances between tests.

## Relationships

- **`_helpers/harness.ts`** — provides `makeComposable` (constructs a composable with a configurable `maxRecords`) and `clearAllInstances` (global teardown).
- **`_helpers/fakeApi.ts`** — provides `apiResolve`, which wraps a resolved value into the fake API response shape the composable expects.
- **`_helpers/fixtures.ts`** — provides `buildUsers` (generates an array of `IUser` objects with optional offset for ids) and the `IUser` type used as the composable's resource generic.

## Notes

- The critical invariant under test: wiping the scope must **exclude** the list key the current fetch is writing to. If it didn't, the in-flight query would be cancelled and resolve `[]` with its list never cached.
- `maxRecords` counts only _new_ records added to the dictionary; refetching (even `forced`) existing records does not increment the count and therefore does not trigger a wipe.
- `fetchMultiple` writes batches and is subject to the same bound — it is not a bypass.
