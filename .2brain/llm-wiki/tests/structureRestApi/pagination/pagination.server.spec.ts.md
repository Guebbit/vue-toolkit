---
source: tests/structureRestApi/pagination/pagination.server.spec.ts
sha256: 41d0cdac95bbbf76c0b5704c0e8c0c8f2f26d1809819f521dac57a5bc9b54c8c
generated_at: 2026-09-28T22:57:37.253703+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/pagination/pagination.server.spec.ts

## Purpose

Tests the server-side pagination contract of the `fetchAll` composable method: each page is fetched and freshness-tracked independently via a per-page key, and items from multiple pages accumulate in a single list. Verifies basic fetching, cross-page accumulation, stale-time deduplication, independent page caching, forced re-fetch, and the edge case of an empty final page.

## Key elements

- **`make()`** — shorthand factory that calls `makeComposable<IProduct, number>()` to instantiate a fresh composable under test.
- **`pageKey(page)`** — builds the per-page freshness key as a one-element array, e.g. `['products-page-1']`.
- **`afterEach(clearAllInstances)`** — tears down all composable instances between tests.
- **Six `it` blocks** covering:
    - Fetch a page and confirm `itemList` length.
    - Accumulate items across two pages (10 + 10 → 20).
    - Within `staleTime`, a second `fetchAll` with the same key does **not** call the API again.
    - Two different keys trigger independent API calls.
    - `{ forced: true }` bypasses the stale check and re-calls the API.
    - An empty page response leaves previously accumulated items intact.

## Relationships

- **`src/composables/structureSearchApi.ts`** — the composable under test; provides `fetchAll`, `itemList`, and the `forced` option this spec exercises.
- **`tests/structureRestApi/_helpers/harness.ts`** — `makeComposable` creates the composable instance; `clearAllInstances` resets state between tests.
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — `apiResolve` wraps a spy function in a resolved Promise so the spec can assert call counts while satisfying `fetchAll`'s async API.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — `buildProducts(count, startId)` generates `IProduct[]` arrays of a given size and starting ID.

## Notes

- The freshness key is a **string array** (not a bare string), matching the composable's expected `key` shape.
- Accumulation is **additive**: fetching an empty page appends zero items rather than replacing the list.
- Stale-time dedup is verified by asserting the _second_ resolver spy was not called; the first spy is the one that ran.
