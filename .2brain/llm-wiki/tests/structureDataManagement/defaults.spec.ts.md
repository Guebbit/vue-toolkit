---
source: tests/structureDataManagement/defaults.spec.ts
sha256: ff8b6e40bbaf465dc18b93b1732c82bcfb39f9393e2c923088e08243a6dd151e
generated_at: 2026-09-28T22:45:04.534484+00:00
model: ollama:qwen3.8:27b
---

# tests/structureDataManagement/defaults.spec.ts

## Purpose

Verifies the "empty defaults" contract of `useStructureDataManagement`: when a parent has no stored children (or the argument is omitted entirely), every accessor and mutator returns an empty collection rather than creating a phantom entry. The suite isolates the `?? []` fallback paths inside the composable.

## Key elements

- **`IItem`** – minimal `{ id: number; name: string }` shape used as the generic item type for every test.
- **`inertStore()`** – factory returning a conforming `IRelationStore<string, number>` whose `addToParent`, `removeFromParent`, and `removeDuplicateChildren` are no-ops and whose `dictionary` is a fixed empty `ref({})`. Exists so the composable's `?? []` fallbacks are actually exercised (the built-in store writes the key before the fallback would trigger).
- **`describe('useStructureDataManagement · empty defaults')`** – six `it` blocks covering:
    - `getRecords()` with no argument → `[]`
    - `removeFromParent` / `removeDuplicateChildren` on an unknown parent (default store) → `[]` and no key in `parentHasMany`
    - Same two mutations with `inertStore` → `[]`
    - `getRecordsByParent` / `getListByParent` on an unknown parent (`inertStore`) → `{}` / `[]`

## Relationships

- **`src/composables/structureDataManagement.ts`** – the module under test. The spec imports `useStructureDataManagement` and the `IRelationStore` type from this file; every assertion targets the API surface it exports.
- **`package.json`** – supplies the test runner (Vitest), Vue, and the project's shared dev tooling that make this spec executable.

## Notes

- The `inertStore` is the critical fixture: without it, the composable's built-in store would insert the parent key into `dictionary` on the first write, masking the `?? []` fallback. The spec comment at the top of the file calls this out explicitly.
- Tests that use the _default_ store (the first three) still pass because the composable guards with `?? []` even when the dictionary is empty; the `inertStore` tests (the last three) confirm the same guarantee holds when the store is explicitly inert, making the fallback dependency explicit rather than incidental.
- This file is one slice of the composable's test suite; it intentionally covers only the zero-data edge case, not happy-path CRUD.
