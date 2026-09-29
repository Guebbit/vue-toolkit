---
source: tests/structureDataManagement/recordStore.spec.ts
sha256: 4528fe33ea37a173879a9a56cf4942e861146560cfc961379ee34009bbc99cff
generated_at: 2026-09-28T22:46:06.948614+00:00
model: ollama:qwen3.8:27b
---

# tests/structureDataManagement/recordStore.spec.ts

## Purpose

Tests that `useStructureDataManagement` routes every read and write exclusively through the injected `IRecordStore` instance, and that it never reaches into the store's internals. Each assertion checks _what the composable tells the store to do_ (via jest spies) rather than asserting on freshness or REST-layer semantics.

## Key elements

- **`IItem`** – minimal `{ id: number; name: string }` shape used as the generic item type throughout.
- **`ALICE` / `BOB`** – two fixed fixture records.
- **`dictOf(...items)`** – builds a `Record<number, IItem>` by assignment (avoids numeric-key object-literal naming-convention lint issues).
- **`spyStore()`** – returns an `IRecordStore<IItem, number>` whose `write`, `remove`, `writeAll`, and `clear` are `jest.fn()` wrappers that also mutate a shared `ref` dictionary, so the composable can read back what was written.
- **`make()`** – factory: creates a fresh spy store and a composable instance bound to it, returning both for per-test assertions.
- **`describe('useStructureDataManagement · recordStore')`** – six tests covering:
    - reads pass-through (store contents → composable output)
    - `addRecord` / `addRecords` → `store.write` called per id
    - `editRecord` → merged object written via `store.write`
    - `editRecord` with `create=false` → only existing ids written; `console.error` called for missing ids
    - `deleteRecord` → `store.remove` called only for held ids
    - `setRecords` / `resetRecords` → `store.writeAll` / `store.clear`

## Relationships

- **`src/composables/structureDataManagement.ts`** – imports `useStructureDataManagement` and the `IRecordStore` type; this spec is the behavioural contract for the store-interaction slice of that composable.
- **`package.json`** – provides `jest` (test runner) and `vue` (re-exports `ref`/`Ref` used by the spy store).

## Notes

- The composable is deliberately _unaware_ of freshness; the test never asserts on timestamps or "fresh" flags. Freshness is the REST-layer store's concern.
- `editRecord` with `create: false` still treats `id 0` as a valid existing key (the test explicitly adds a record with `id: 0` before editing it).
- `afterEach` calls `jest.restoreAllMocks()` to clean up the `console.error` spy even when a preceding assertion throws.
- The `dictOf` helper exists specifically because a numeric-keyed object literal (`{ 1: ALICE }`) triggers a lint naming-convention rule in this repo.
