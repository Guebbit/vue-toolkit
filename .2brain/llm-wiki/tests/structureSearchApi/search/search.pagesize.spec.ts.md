---
source: tests/structureSearchApi/search/search.pagesize.spec.ts
sha256: 29a004e65fa29f8290ede6049abea7d46d7e8727b0b97eee4ae24d2cf1b86b67
generated_at: 2026-09-28T23:11:52.554918+00:00
model: ollama:qwen3.8:27b
---

# tests/structureSearchApi/search/search.pagesize.spec.ts

## Purpose

Verifies that `pageSize` participates in the search cache key: the same filters + page at different pageSizes produce independent cache buckets, repeated identical queries hit the cache, and `searchGet` only returns results that were fetched with the exact pageSize being queried.

## Key elements

- **`make()`** — thin wrapper around `makeSearchComposable<IArticle, number>()`; creates a fresh search-API instance per test.
- **`TECH` / `SPORT`** — static fixture arrays (5 and 3 articles) used to distinguish which bucket a query lands in.
- **`filters`** — constant `{ category: 'tech' }` shared by all tests; kept simple so only `pageSize` varies.
- **`describe('SEARCH · pageSize dimension')`** — five test cases covering: separate buckets per pageSize, default vs. explicit pageSize, cache-hit on identical triple, `searchGet` returning the correct bucket, and `searchGet` returning `[]` for an unpopulated pageSize.

## Relationships

- **`tests/structureSearchApi/_helpers/harness.ts`** — supplies `makeSearchComposable` (builds the SUT) and `clearAllInstances` (called in `afterEach` to reset singleton state between tests).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — supplies `apiResolve`, which wraps a resolved payload in a jest mock so the test can assert call counts per bucket.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — supplies `buildArticles` (generates deterministic `IArticle` arrays) and the `IArticle` type used as the generic for the composable.

## Notes

- The 4th argument to `fetchSearch` is `pageSize`; when omitted it defaults to **10**. The "default vs. explicit 20" test relies on that implicit default.
- `searchGet` returns an **empty array** (`[]`)—not `undefined`—when the requested pageSize has no cached bucket.
- `clearAllInstances` is invoked in `afterEach` rather than `beforeEach`; tests must not assume residual state from a prior test.
