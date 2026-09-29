---
source: tests/structureRestApi/pagination/pagination.paginate.spec.ts
sha256: 28db6b4e90d16ea889a7f4c08a097266b30f3c30950f013536e0e0643c79eac5
generated_at: 2026-09-28T22:57:21.922981+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/pagination/pagination.paginate.spec.ts

## Purpose

Test suite for the `fetchPaginate` method on the structure-search composable. Verifies that server-side pagination (one page at a time, no filter layer) caches each `(page, pageSize, key)` tuple as an independent bucket, does not re-fetch a fresh page, supports a forced bypass, and accumulates items across pages into the shared item dictionary.

## Key elements

- **`make()`** — local factory wrapping `makeComposable<IProduct, number>()` to create a fresh composable instance per test.
- **`describe('PAGINATION · fetchPaginate')`** — the single test group; five `it` blocks cover:
    - Independent caching of page 1 vs page 2.
    - No re-fetch when the same `(page, pageSize)` is requested again while the cache is fresh.
    - `{ forced: true }` option bypasses the cache.
    - Different `pageSize` values produce separate cache buckets.
    - Items from multiple pages accumulate in `c.itemList.value`.
- **`afterEach(clearAllInstances)`** — tears down all composable instances between tests to prevent cross-test cache leakage.

## Relationships

- **`_helpers/harness.ts`** — `makeComposable` creates the instance under test; `clearAllInstances` resets global state after each case.
- **`_helpers/fakeApi.ts`** — `apiResolve` wraps a pre-built array into a spy-able callable so tests can assert call counts without a real HTTP layer.
- **`_helpers/fixtures.ts`** — `buildProducts(count, offset)` generates deterministic `IProduct` arrays for a given page size and 1-based page; `IProduct` is the item type parameterized into the composable.

## Notes

- `fetchPaginate` is intentionally **not** coupled to filters or totals; those belong to the higher-level `fetchSearch` (documented in its own spec). Tests here must not assume filter or `searchGet` semantics.
- The "key" parameter (third argument) is always `1` in these tests; the bucket-isolation guarantee for different keys is tested elsewhere.
- `apiResolve` returns a Jest spy, so `toHaveBeenCalledTimes` / `not.toHaveBeenCalled` assertions are the primary mechanism for proving cache hits vs. misses.
