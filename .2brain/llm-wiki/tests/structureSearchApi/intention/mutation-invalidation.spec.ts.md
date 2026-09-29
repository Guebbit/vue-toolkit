---
source: tests/structureSearchApi/intention/mutation-invalidation.spec.ts
sha256: 9cd03ebe055d4865c00718e94f087038640bcd65b729c8dcf2929694e8aae698
generated_at: 2026-09-28T23:09:28.714387+00:00
model: ollama:qwen3.8:27b
---

# tests/structureSearchApi/intention/mutation-invalidation.spec.ts

## Purpose

Verifies that a successful `createTarget`, `updateTarget`, or `deleteTarget` mutation invalidates the search-page cache: an active `watchSearch` refetches the on-screen page (using the filters the watcher applied, not whatever the reactive `filters` ref now holds), and a page that was fetched without a watcher becomes stale so the next `fetchSearch` hits the server again.

## Key elements

- **`mutations`** – Array of three `{ name, run }` entries, one per mutating API call (`createTarget`, `updateTarget`, `deleteTarget`). Drives the `describe.each` block so every test runs against each mutation.
- **`searchOperation()`** – Factory returning a `jest.fn` that resolves a fixed `TECH` article list; used as the stand-in for the real search operation so call counts/args can be asserted.
- **`anyContext`** – `expect.objectContaining({ signal: expect.any(AbortSignal) })` matcher; appended to every `operation` call assertion because the harness injects a `{ signal }` context as the trailing argument.
- **`TECH` / `NEW_ARTICLE`** – Concrete `IArticle` fixtures (built via `buildArticles(3, 'tech', 1)` and a hand-written new record) used as the search payload and the created entity.
- **Two test cases** (repeated per mutation):
    1. _Active watcher refetch_ – confirms `watchSearch` calls the operation a second time after the mutation, with the **original** filters (not the ones changed after the first fetch).
    2. _Cached page goes stale_ – confirms `checkSearch` flips from `true` → `false` after the mutation, and the subsequent `fetchSearch` actually calls the operation again.

## Relationships

- **`tests/structureSearchApi/_helpers/harness.ts`** – Supplies `makeSearchComposable`, `clearAllInstances` (used in `afterEach` to tear down composable state between tests), and `flush` (microtask pumping for the composable's async pipeline).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** – Supplies `apiResolve`, the minimal fake used to wrap plain values in the "resolved API call" shape the search composable expects for mutation payloads.
- **`tests/structureRestApi/_helpers/fixtures.ts`** – Supplies `buildArticles` (generates N articles in a category) and the `IArticle` type that parameterises the composable and fixtures.

## Notes

- The file is intentionally paired with `tests/structureRestApi/intention/list-invalidation.spec.ts`, which covers the _non-search_ list kinds. The INTENTION banner comment cross-references it.
- `describe.each(mutations)` means the same two assertions execute three times (once per mutation). A failure in one mutation will surface in all three `it` blocks.
- The first test deliberately mutates `filters.value` _after_ the initial fetch to prove the refetch uses the filters captured by the watcher, not the live ref.
