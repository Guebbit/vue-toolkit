---
source: tests/structureDataManagement/property.spec.ts
sha256: 0b034938996aca89f4867803f3fdba2b0686cc03092ec57a8a00054c577327a7
generated_at: 2026-09-28T22:45:51.998321+00:00
model: ollama:qwen3.8:27b
---

# tests/structureDataManagement/property.spec.ts

## Purpose

Property-based test suite (fast-check) for the `useStructureDataManagement` composable. Rather than hand-picked examples, it asserts invariants that must hold for _all_ inputs across five concern areas: single and composite identifier creation, ID-based record lookup, client-side pagination, CRUD sequence consistency against a plain `Map`, and parent/child relation operations.

## Key elements

- **`otherSplits(a, b, delimiter)`** — Enumerates every `[a', b']` split of the string `a + delimiter + b` that a naive `.split` would produce; used to prove no ambiguity survives the escaping scheme.
- **`idArbitrary` / `modelOpArbitrary`** — Small overlapping ID pool (0–4) and a discriminated-union arbitrary for `add | edit | delete` operations, feeding the CRUD sequence test.
- **`paginated(items, pageSize)`** — Helper that builds a composable, loads records via `setRecords`, and writes `pageSize` directly.
- **`expectPagesToPartitionItemList(c)`** — Walks every page, asserting each page ≤ `pageSize` items and that concatenated pages equal `itemList` exactly.
- **`describe('PROPERTY · createIdentifier — composite identifiers')`** — The core regression block: proves `createIdentifier` is injective even when a field value contains the delimiter (single-char and multi-char cases).
- **`describe('PROPERTY · recordListByIds / recordsByIds')`** — Verifies order-preservation and "exactly the requested ids that exist" semantics.
- **`describe('PROPERTY · client-side pagination')`** — Exercises `pageSize` with negatives, NaN, and fractional values; asserts clamping to ≥ 1 whole number.
- **`describe('PROPERTY · addRecord / editRecord / deleteRecord sequences')`** — Replays up to 30 random operations against a `Map` model and checks `itemDictionary` matches.
- **`describe('PROPERTY · addToParent / removeFromParent / removeDuplicateChildren')`** — Verifies add-then-remove restores prior children exactly.

## Relationships

- **`src/composables/structureDataManagement.ts`** — The module under test. Every `describe` block instantiates `useStructureDataManagement` and exercises its returned API (`createIdentifier`, `setRecords`, `pageSize`, `pageItemList`, `pageTotal`, `addRecord`, `editRecord`, `deleteRecord`, `itemDictionary`, parent/child methods).
- **`src/internal/recordLookup.ts`** — Source of `recordListByIds` and `recordsByIds`, tested here in the "recordListByIds / recordsByIds" block against a `Map`-backed `getRecord` callback.

## Notes

- The composite-id collision test does **not** rely on random luck: it _constructs_ the ambiguous pair `('${p}|${m}', s)` vs `(p, '${m}|${s}')` so a plain `.join('|')` is guaranteed to collide. This is the regression guard for the escaping logic in `src/internal/identifierJoin.ts` (referenced in comments, not directly imported).
- The multi-character delimiter test restricts the alphabet to `:` and `\` and enforces `numRuns ≥ 100` so a low `FC_NUM_RUNS` global cannot skip every ambiguous case.
- `idOf` filters out `'__proto__'` because `recordsByIds` uses bracket assignment on a plain object; that key would mutate the prototype rather than set an own property. This is a pre-existing quirk of the implementation, not a bug the test targets.
- `pageSize` is written as-is (bypassing any setter validation) to test the internal clamp/round logic, including `NaN` and non-integer values.
