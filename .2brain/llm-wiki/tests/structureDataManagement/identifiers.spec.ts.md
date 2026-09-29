---
source: tests/structureDataManagement/identifiers.spec.ts
sha256: f80b08a38f9ebd587d0c4ff7f1dacc40741683b682f12a1e89052e5f2c4d4074
generated_at: 2026-09-28T22:45:31.027804+00:00
model: ollama:qwen3.8:27b
---

# tests/structureDataManagement/identifiers.spec.ts

## Purpose

Unit tests for the edge-case branches of `useStructureDataManagement` that a happy-path suite would skip: fallback identifier generation (and its write-back onto the item), multi-identifier composition, `editRecord`/`editRecords` create-vs-update semantics, the `create=false` guard, and `deleteRecord` idempotency.

## Key elements

- **`describe('createIdentifier — single identifier')`** — verifies that `createIdentifier` returns the existing value, generates and _writes back_ a fallback when the id field is absent/null, is stable across repeated calls on the same item, and supports a custom field name via the second argument.
- **`describe('createIdentifier — multiple identifiers')`** — covers delimiter-joined composite keys, order sensitivity, partial fallback (only missing fields are filled), and `getRecord` lookup by multi-part key.
- **`describe('addRecord with a missing identifier')`** — confirms that `lastInsertedIdentifier` and `lastInsertedRecord` are populated when the id is auto-generated.
- **`describe('editRecord return value & guards')`** — asserts the return contract (new id on create, `undefined` on update), and that `create=false` with a missing or absent id logs `console.error` and performs no mutation.
- **`describe('editRecords (batch)')`** — verifies that `lastInsertedIdentifiers` collects only newly-inserted ids, and that `undefined` array entries are silently skipped.
- **`describe('deleteRecord')`** — confirms a no-op (no throw, list unchanged) when the id does not exist.
- **`IItem`** — local interface (`id?: number | string; name: string`) used as the generic parameter for single-identifier tests.

## Relationships

- **`src/composables/structureDataManagement.ts`** — the sole import under test. Every assertion in this file exercises a member of the object returned by `useStructureDataManagement<T>(…)` (`createIdentifier`, `addRecord`, `editRecord`, `editRecords`, `getRecord`, `deleteRecord`, `itemList`, `lastInsertedIdentifier(s)`, `lastInsertedRecord`). No other modules are touched.

## Notes

- `console.warn` and `console.error` are spied on and muted in `beforeEach`/`afterEach`; several assertions depend on them having (or not having) been called, so removing the mocks will change test outcomes.
- The `null`-as-missing test carries an `eslint-disable-next-line unicorn/no-null` comment — it intentionally exercises a branch the type system would normally prevent.
- Multi-identifier tests use `as never` casts on `getRecord` arguments because the composable's overloads don't expose a variadic signature; this is a typing workaround, not a runtime concern.
- The file is explicitly scoped as "UNIT" and is meant to complement (not duplicate) a base happy-path spec.
