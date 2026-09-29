---
source: tests/structureSearchApi/search/search.pages.spec.ts
sha256: d7adb6da8a603a8df6cb2cfdf42df083308e146bdd3c7d958f228a3fa91030f1
generated_at: 2026-09-28T23:11:39.468398+00:00
model: ollama:qwen3.8:27b
---

# tests/structureSearchApi/search/search.pages.spec.ts

## Purpose

Vitest spec verifying the **per-page caching contract** of the search composable: each page of a query is fetched and cached independently, re-requesting a fresh cached page short-circuits the API, and the aggregated `itemList` / `pageTotal` reflect all loaded pages correctly.

## Key elements

- **`make()`** – one-line factory returning `makeSearchComposable<IArticle, number>()`, used by every test case.
- **`PAGE1` / `PAGE2` / `PAGE3`** – fixture arrays (5, 5, 2 items) built with `buildArticles`, representing successive pages of the same `category: 'tech'` query.
- **`TOTAL`** – `12`, the server-reported total item count; the same value is attached to every page response.
- **`filters`** – `{ category: 'tech' }`, the query key that identifies the cached search.
- **`afterEach(clearAllInstances)`** – tears down all composable instances between tests.
- **`describe('SEARCH · pages')`** – six test cases:
    - _different pages each call the API_ – distinct `apiResolve` spies are called once.
    - _each page is retrievable via searchGet_ – `searchGet(filters, n)` returns the correct page's articles.
    - _re-requesting a cached page is a cache hit_ – second `fetchSearch` for the same page does **not** invoke the spy.
    - _forward-then-back navigation does not refetch page 1_ – ordering doesn't invalidate earlier pages.
    - _all pages accumulate in the dictionary_ – `itemList.value` length equals the sum of all page sizes (12).
    - _pageTotal is `ceil(totalItems / pageSize)`_ – sets `searchApi.pageSize.value` to 5 before fetching; asserts `totalItems` and derived `pageTotal`.

## Relationships

- **`tests/structureSearchApi/_helpers/harness.ts`** – imports `makeSearchComposable` (the system under test) and `clearAllInstances` (teardown).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** – imports `apiResolve`, which returns a thenable that resolves with the given payload while recording call counts (asserted via `toHaveBeenCalledTimes` / `not.toHaveBeenCalled`).
- **`tests/structureRestApi/_helpers/fixtures.ts`** – imports `buildArticles` (factory for article arrays) and the `IArticle` type.

## Notes

- `totalItems` / `pageTotal` resolve by reading the composable's **shared `pageSize` REF**, not the `pageSize` argument passed to `fetchSearch`. The last test sets `searchApi.pageSize.value` explicitly to keep the two aligned; omitting that step would make the lookup inconsistent.
- `TOTAL` is intentionally identical across every page response — it represents the _query-wide_ total, not a per-page count.
- The spec relies on `apiResolve` doubles acting as call-count spies; there is no separate `jest.fn()` or `vi.fn()` wrapper.
