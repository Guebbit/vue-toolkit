---
source: src/internal/recordLookup.ts
sha256: 794916b3e01f78139d9597d6a045bd5fe72d06a538b1b4b6867b5e5791a17a22
generated_at: 2026-09-28T22:34:43.405044+00:00
model: ollama:qwen3.8:27b
---

# src/internal/recordLookup.ts

## Purpose

Shared lookup helpers that resolve an array of record ids into their stored records. Exists so every `belongsTo` view in the codebase uses a single, consistent id→record resolution strategy rather than reimplementing the filter-and-collect pattern inline.

## Key elements

- **`recordsByIds<T, K extends PropertyKey>(ids, getRecord)`** — Returns a `Record<K, T>` keyed by id. Skips ids for which `getRecord` returns `undefined`. Because the result is a plain object, integer-like keys are re-ordered numerically by the JS engine, so insertion order is **not** guaranteed.
- **`recordListByIds<T, K>(ids, getRecord)`** — Returns a `T[]` in the same order as the input `ids`. Filters out `undefined` results. Use this when order matters.

Both are generic over the id type `K` and the record type `T`, and both accept a `readonly` array plus a single-record getter callback, keeping the storage backend agnostic.

## Relationships

- **`src/composables/structureDataManagement.ts`** — Consumes these two functions to resolve `belongsTo` view data from a list of related ids into display-ready records or record lists.
- **`tests/structureDataManagement/property.spec.ts`** — Exercises the composable (and indirectly the lookup helpers) to verify that `belongsTo` properties resolve correctly and that missing records are omitted.

## Notes

- Choose `recordsByIds` when you need O(1) id→record access and don't care about order; choose `recordListByIds` when the UI or downstream logic depends on the ids appearing in their original sequence.
- Both functions treat `undefined` as the sole "not found" sentinel. A stored record that is explicitly `null` **will** be included in the result.
