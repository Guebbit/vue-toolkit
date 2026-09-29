---
source: tests/structureCrudApi/filters.spec.ts
sha256: 592a78e299ae6cc026c11e0c8b3c3c017cb1cf2ba234d8d2b349dc57635b56cd
generated_at: 2026-09-28T22:44:22.985629+00:00
model: ollama:qwen3.8:27b
---

# tests/structureCrudApi/filters.spec.ts

## Purpose

Verifies the invariant that the live `filters` object and the `initialFilters` object are never the same reference. If they shared an object, in-place form edits would silently corrupt the "initial" state (breaking `resetFilters()`) and typing during `watchList` could produce spurious search requests. The two tests guard against that class of regression.

## Key elements

- **`IProduct` / `IProductFilters`** — minimal generic types (`id`, `title` / `text?`, `tags?`) used to parametrize the composable under test.
- **`makeCrud(initialFilters)`** — factory that wires a jest-mocked `search` operation into `useStructureCrudApi`, tracks cleanup via `runTracked`, and returns `{ api, operations }`. Reused by every test case.
- **`resetFilters() returns to the initial filters after in-place edits`** — mutates `api.filters` in place (string assignment + array push), calls `resetFilters()`, then asserts both the live and the original `initialFilters` object are unchanged.
- **`typing into the filters while watchList runs sends no request`** — calls `watchList()`, flushes, then mutates `filters.text` twice across separate microtask flushes; asserts `operations.search` was called exactly once (the initial fetch), proving mid-watch edits do not re-trigger.
- **`afterEach(clearAllInstances)`** — resets all tracked composable instances between tests.

## Relationships

- **`src/composables/structureCrudApi.ts`** — imports `useStructureCrudApi` and the `IStructureCrudOperations` type; this file exercises its `filters` / `initialFilters` / `resetFilters` / `watchList` surface.
- **`tests/structureRestApi/_helpers/harness.ts`** — imports `clearAllInstances`, `flush`, `newTestClient`, and `runTracked` for lifecycle management, microtask draining, and a throwaway query client.

## Notes

- The tests deliberately mutate `api.filters` **in place** (`.text = …`, `.tags!.push(…)`). This is the exact pattern a form binding would use; the assertions confirm the composable internally clones `initialFilters` rather than aliasing it.
- `makeCrud` returns a jest mock for `search`, so the second test can count call invocations without a real HTTP layer.
- The file is scoped to `describe('CRUD · filters')`; other CRUD behaviors (pagination, mutations, etc.) live in sibling spec files under `tests/structureCrudApi/`.
