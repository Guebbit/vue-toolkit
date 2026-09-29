---
source: tests/structureDataManagement/core.spec.ts
sha256: 5c58feec781fa3f0e237cc4e54c7bfa2010c1e0cf0b710b422fd2c114e9669ef
generated_at: 2026-09-28T22:44:50.407281+00:00
model: ollama:qwen3.8:27b
---

# tests/structureDataManagement/core.spec.ts

## Purpose

Unit-test suite for the `useStructureDataManagement` composable. Exercises the full CRUD surface, pagination logic, selection tracking, and parent–child linking to lock down expected behavior before it reaches application code.

## Key elements

- **`ITestItem`** — minimal `{ id: number; name: string }` fixture used as the generic `T` parameter throughout.
- **`describe('useStructureDataManagement')`** — top-level block; each sub-block targets one API area:
    - `addRecord / getRecord` — add, retrieve-by-id, overwrite-on-readd, missing-key → `undefined`.
    - `addRecords / itemList` — bulk insert, `undefined` entries silently skipped.
    - `editRecord` — partial merge into existing record; `create: true` path where the id comes from the data object and the return value is that id.
    - `deleteRecord` — removal makes `getRecord` return `undefined`.
    - `setRecords / resetRecords` — direct dictionary replacement and full clear.
    - `selectedRecord` — reactive lookup driven by `selectedIdentifier`.
    - `pagination` — `pageTotal` ceiling, per-page slice lengths, last-page remainder, and the `Infinity`/`-Infinity` guard that leaves `pageSize` unchanged.
    - `parent-child relationships` — `addToParent` / `removeFromParent` / `getListByParent`, including the case where a numeric id `1` is removed using the string `'1'` (object-key coercion).
- **`describe('useStructureDataManagement · parent ids')`** — isolated check that parent id `0` is treated as valid (not swallowed by a falsy check).

## Relationships

- **`src/composables/structureDataManagement.ts`** — the sole import; the file instantiates `useStructureDataManagement<ITestItem>` (and in one test a three-generic variant `<ITestItem, number | string, string>`) and calls every public method it exposes. All assertions are against the composable's return value.

## Notes

- **`as never` casts** are used on nearly every id argument (`getRecord(1 as never)`, `deleteRecord(1 as never)`, etc.). This is a workaround for the composable's generic signature, not an intentional test technique—don't propagate the pattern into production code.
- **Object-key coercion for parent children:** `parentHasMany` is keyed by string (JS object keys), so numeric `1` and string `'1'` are the same slot. The dedicated test documents this explicitly; any code that compares child ids must account for it.
- **`pageSize` guard:** assigning `Infinity` or `-Infinity` is silently rejected (the setter retains the previous value). This is a deliberate composable contract, not a test artifact.
- **`editRecord` create semantics:** when the `create` flag is `true` and the caller passes no explicit id argument, the id is read from the data object itself and returned from the call. The test asserts `createdId === 2`, not a generated id.
