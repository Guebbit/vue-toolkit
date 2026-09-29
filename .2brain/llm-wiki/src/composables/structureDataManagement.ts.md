---
source: src/composables/structureDataManagement.ts
sha256: 9fe67c561dbefd5b65af7f4fd6b28dc19f2ab9f9a2916172dbce410999053dfa
generated_at: 2026-09-28T22:30:23.453958+00:00
model: ollama:qwen3.8:27b
---

# src/composables/structureDataManagement.ts

## Purpose

Provides the core client-side record-management composable (`useStructureDataManagement`): a reactive dictionary of records keyed by identifier, plus selection, "last inserted" tracking, client-side pagination, and parent↔child (belongsTo) relations. All reads and writes are routed through two pluggable stores (`IRecordStore`, `IRelationStore`) so the same logic works identically over a plain local `ref` or over a TanStack Query cache supplied by the REST layer.

## Key elements

- **`TIdOf<T>`** – Type helper that extracts `T['id']` (when it is `string | number`) or falls back to `string | number`. Used as the default `K` across the composable's generics.
- **`IRecordStore<T, K>`** – Interface for the record write/read surface: `dictionary`, `write`, `remove`, `writeAll`, `clear`, and optional `resolve`, `read`, `isFetching`. The optional methods let the REST layer avoid expensive computed rebuilds and distinguish server-fetched writes from caller-created ones.
- **`createLocalRecordStore<T, K>()`** – Default `IRecordStore` backed by a single `ref({})`. Implements `read` as a direct `dictionary.value[id]` lookup.
- **`IRelationStore<P, K>`** – Interface for parent→child link management: `dictionary`, `addToParent`, `removeFromParent`, `removeDuplicateChildren`.
- **`createLocalRelationStore<P, K>()`** – Default `IRelationStore` backed by a `ref({})`. Uses `sameId` / `uniqueIds` from `idEquality` for idempotent link operations.
- **`IStructureDataManagementApi<T, K, P>`** – Explicit interface for the composable's full return value (dictionary ops, selection, pagination, relation helpers) so the public `.d.ts` stays self-contained.
- **`useStructureDataManagement(identifiers, delimiter, recordStore, relationStore)`** – The main exported composable. Returns the `IStructureDataManagementApi`: `createIdentifier`, `getRecord(s)`, `addRecord(s)`, `editRecord(s)`, `deleteRecord`, `selectedRecord`, `lastInsertedRecord`, pagination (`pageCurrent`, `pageSize`, `pageItemList`), and parent/child helpers (`addToParent`, `getRecordsByParent`, etc.).

## Relationships

- **`src/internal/idEquality.ts`** – Imports `sameId` and `uniqueIds`, used by the local relation store to deduplicate and compare child ids.
- **`src/internal/identifierJoin.ts`** – Imports `joinIdentifiers`, used by `createIdentifier` to combine multi-field identifiers with the delimiter.
- **`src/internal/recordLookup.ts`** – Imports `recordListByIds` and `recordsByIds`, used by `getRecords` to resolve a list of ids to stored records.
- **`src/composables/structureRestApi.ts`** – Passes TanStack-backed `IRecordStore` / `IRelationStore` implementations into `useStructureDataManagement`, making the local stores read-only views of the query cache.
- **`src/composables/structureCrudApi.ts`** – Consumes the data-management composable to add CRUD operations on top of it.
- **`src/composables/structureSearchApi.ts`** – Sibling composable that interacts with the same record store for search-driven record population.
- **`src/internal/queryRecordStore.ts`** – Likely provides the TanStack-backed `IRecordStore` implementation used by the REST layer.
- **`src/index.ts`** – Re-exports `useStructureDataManagement` and the public types.
- **Tests** – `tests/structureDataManagement/{core,defaults,boundaries}.spec.ts` cover the composable's CRUD, default-store, and edge-case behavior; `tests/internal/settleCallbacks.spec.ts` exercises async settlement of callback interactions.

## Notes

- **Child-id coercion in relations:** The local relation store uses `sameId`, meaning `1` and `'1'` are treated as the _same_ child (object-key comparison). This is intentional but non-obvious.
- **`read?` on `IRecordStore`:** Exists to give the REST layer a cheap single-record path. Without it, `editRecord` falls back to `dictionary.value[id]`, which under TanStack is a computed that rebuilds its entire scope per read — O(batch × cache) over a multi-record edit loop.
- **`isFetching?()`:** When present, gates `lastInsertedIdentifier` so that server-reported writes (list fetches, `GET` by id) do _not_ move the "last inserted" pointer. The local store omits it, so every write counts as a create.
- **`P` is not inferred across composables:** If the parent identifier type matters, pass it explicitly as the third generic; TypeScript will not infer it from one composable into another.
- **`pageSize` is clamped ≥ 1 on write;** setting it below 1 has no effect.
- **`ref()` cast past `UnwrapRef`:** The local stores cast `ref({} as Record<K, T>) as Ref<Record<K, T>>` because `any` in `T` defeats Vue's unwrapping inference. Purely type-level; no runtime impact.
