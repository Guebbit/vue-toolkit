---
source: tests/structureDataManagement/effects.spec.ts
sha256: 634c3081201d1f8bfb69835d393238b016f954a4662ab3fef97bd9bda6ee616d
generated_at: 2026-09-28T22:45:18.549116+00:00
model: ollama:qwen3.8:27b
---

# tests/structureDataManagement/effects.spec.ts

## Purpose

Tests the **effect-timing contract** of `useStructureDataManagement` — i.e., _when_ its computeds re-evaluate, not _what_ they return. It guards against both over-eager recomputation (causing unnecessary re-renders) and stale values (causing wrong UI), regressions that value-only tests in `structureDataManagement.spec.ts` cannot catch.

## Key elements

- **`countFires(source, run)`** — Core helper. Attaches a `watch` with `flush: 'sync'` to a reactive source, executes `run()`, then returns the number of times the watcher fired. The fire count _is_ the assertion.
- **`make()`** — Factory returning `useStructureDataManagement<IItem, number>('id')`, giving each test an isolated composable instance.
- **`IItem`** — Minimal shape (`id`, `name`, optional `tag`) used as the generic parameter for the composable.
- **`describe('selectedRecord — property-level tracking')`** — Verifies `selectedRecord` fires 0× on unrelated record mutations, 1× on editing the selected record, 1× on switching `selectedIdentifier`, and 1× when a previously-missing record is finally added.
- **`describe('lastInsertedRecord')`** — Confirms it fires ≥ 1× per insert and settles on the most recently added record.
- **`describe('itemList')`** — Asserts exactly one fire per structural write (add, add, delete → 3 fires).
- **`describe('pagination computeds…')`** — Validates `pageTotal`, `pageOffset`, `pageItemList` are pure derivations (no hidden state) and that `pageItemList` does **not** depend on `selectedIdentifier`.

## Relationships

- **`src/composables/structureDataManagement.ts`** — The system under test. This spec imports `useStructureDataManagement` and exercises its computed/watchable outputs (`selectedRecord`, `lastInsertedRecord`, `itemList`, `pageTotal`, `pageOffset`, `pageItemList`) plus its action methods (`addRecord`, `editRecord`, `deleteRecord`, `addRecords`).
- **`package.json`** — Provides the test runner (Jest) and Vue reactivity implementation that these specs depend on at runtime.

## Notes

- Every watcher uses `flush: 'sync'` deliberately: this collapses the async queue so one reactive write produces at most one callback, making the integer fire count a precise assertion. Do **not** switch to default (pre/nextTick) flushing without rethinking the assertions.
- The `as never` casts on `editRecord` / `deleteRecord` calls suppress a TS structural-mismatch (the test passes a partial object / raw number where the composable expects its full item type). This is a test-file shortcut, not a composable bug.
- The file explicitly scopes itself as complementary to `structureDataManagement.spec.ts`; together they cover _what_ vs. _when_ the composable re-evaluates.
