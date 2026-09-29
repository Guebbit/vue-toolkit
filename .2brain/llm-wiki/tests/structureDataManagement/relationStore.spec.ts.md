---
source: tests/structureDataManagement/relationStore.spec.ts
sha256: a037e58a58622f86c13add331a384e2262581002b4e43d1ade62e6670bf54c5a
generated_at: 2026-09-28T22:46:21.896517+00:00
model: ollama:qwen3.8:27b
---

# tests/structureDataManagement/relationStore.spec.ts

## Purpose

Verifies the 4th parameter of `useStructureDataManagement` — the `IRelationStore` that mediates parent/child link reads and writes. Confirms that (a) all dictionary reads and writes are routed through the supplied store, and (b) when no store is passed, each composable instance builds its own independent local relation state.

## Key elements

- **`IItem`** — minimal record shape (`id: number`, `name: string`) used throughout the tests.
- **`teamOf(ids)`** — helper that returns a single-entry `Record<string, number[]>` keyed by `'team-1'`. The hyphenated key is deliberate (bracket-notation requirement).
- **`spyStore()`** — wraps a plain `Ref<Record<string, number[]>>` in a `jest.fn`-based object satisfying `IRelationStore<string, number>`. Each method both spies the call and applies the mutation to the underlying ref.
- **`make()`** — factory that creates a fresh spy store and instantiates `useStructureDataManagement<IItem, number, string>('id', '|', undefined, store)`, returning both the store and the composable result.
- **`describe('useStructureDataManagement · relationStore')`** — four tests:
    1. _Reads through the store_: pre-populating `store.dictionary` is reflected in `records.parentHasMany`.
    2. _Writes through the store_: `addToParent`, `removeFromParent`, `removeDuplicateChildren` each delegate to the corresponding spy.
    3. _`getListByParent` / `getRecordsByParent` read through the store_: resolved records come from the store's dictionary.
    4. _Instance isolation without a store_: two composable instances created without the 4th argument keep independent `parentHasMany` state.

## Relationships

- **`src/composables/structureDataManagement.ts`** — the system under test. This spec imports `useStructureDataManagement` and the `IRelationStore` type from that module and exercises its 4th-parameter code path.
- **`package.json`** — provides the Jest test runner and `jest.fn` spy API used by `spyStore`.

## Notes

- The `'team-1'` key is intentionally hyphenated so the object must be accessed via bracket notation; this is a style/convention guard, not a functional requirement.
- `spyStore` satisfies `IRelationStore<string, number>` (key = `string`, child id = `number`), which pins the generic instantiation expected by the composable.
- The "no store" test calls `useStructureDataManagement` with only one argument (`'id'`), relying on the remaining parameters defaulting to `undefined`.
