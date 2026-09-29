---
source: tests/structureRestApi/unit/fetchTargetAlias.spec.ts
sha256: 657a53838e75eb5a744f8b633a6564acd7f2ddb1bd0501b4d25b09d0f13f3305
generated_at: 2026-09-28T23:03:07.944807+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/fetchTargetAlias.spec.ts

## Purpose

Unit tests verifying that `fetchTarget` called with an alternate key (e.g. a slug) stores the record **once** under its own `id`, leaving only an alias pointer at the requested key. Ensures no divergent duplicate copies appear in `itemDictionary`/`itemList`, and that all write operations (`updateTarget`, `deleteTarget`, `editRecord`, `deleteRecord`) resolve through the alias to the single canonical record.

## Key elements

- **`ISlugged`** – local test interface (`{ id: number; name: string }`) modeling a resource that can be addressed by both a numeric id and a string slug.
- **`make()`** – thin wrapper around `makeComposable<ISlugged, number | string>()` from the shared harness.
- **`seeded()`** – async helper that creates a composable and pre-fetches record `{ id: 7, name: 'Alice' }` via the slug `'my-slug'`; used by every "writes by an alternate key" test.
- **`describe('UNIT · fetchTarget by an alternate key')`** – three tests covering: single-storage + alias resolution, alias-as-pointer (mutation via `editRecord` on id is visible through slug), and no-duplicate on a follow-up fetch by the real id.
- **`describe('UNIT · writes by an alternate key')`** – five tests covering `updateTarget`, `deleteTarget`, `editRecord`, `deleteRecord` all targeting the alias, plus a stale-alias re-fetch scenario (after the target record is deleted, the slug is treated as a cache miss and the server is called again).
- **`afterEach(clearAllInstances)`** – global teardown imported from the harness.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** – provides `makeComposable` (the composable factory under test) and `clearAllInstances` (reset between tests). This spec is a consumer of that harness; no other file imports it.

## Notes

- The test uses **Jest** (`jest.fn`, `expect`, `describe`/`it`), not Vitest.
- The alias is documented (in the file header) as `{ aliasOf: 7 }` — a one-hop pointer, not a second copy. Tests assert `getRecord('my-slug')` and `getRecord(7)` return the _same_ object, and `itemList.value` has length 1.
- `seeded()` is defined at module scope (not inside a `describe`) and is shared by both write-related tests; it performs an actual `fetchTarget` call, so ordering within the describe block matters if assertions depended on prior state (they don't here, thanks to `clearAllInstances`).
