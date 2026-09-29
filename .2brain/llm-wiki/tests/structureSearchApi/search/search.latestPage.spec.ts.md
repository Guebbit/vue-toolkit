---
source: tests/structureSearchApi/search/search.latestPage.spec.ts
sha256: 0d2ceff46cce78ed6fefe418b5db9292cd921edbc4b6f18816388697aecc6afa
generated_at: 2026-09-28T23:11:20.692811+00:00
model: ollama:qwen3.8:27b
---

# tests/structureSearchApi/search/search.latestPage.spec.ts

## Purpose

Tests the `totalItems` fallback logic in the search composable: when the current page (page 1) is still in flight, `totalItems` must resolve from the most recently updated cached page that belongs to the same applied search. The suite verifies the recency pick, tie-breaking, and the strict matching rules (filters, scope, kind, bucket key, data presence) that determine which cached pages are eligible.

## Key elements

- **`makeApplied(settingsKey?)`** – local helper that creates a search composable, kicks off a `fetchSearch` for page 1 with a never-resolving `deferred` promise (so page 1 stays in flight), and returns `{ searchApi, queryClient }`.
- **`describe('SEARCH · latest page')`** – the test block covering:
    - _Recency pick_ (`it.each`): the page with the larger `dataUpdatedAt` wins regardless of which was cached first.
    - _Equal timestamps_: the first-found page wins and stays stable across unrelated cache events.
    - _No applied search_: `totalItems` stays 0 even with pages in cache.
    - _Filter / scope / kind / bucket-key mismatch_: look-alike entries are never selected.
    - _Bucket key exactness_: an extra key segment disqualifies; a matching bucket key qualifies.
    - _Page number & size independence_: any page number/size is eligible.
    - _Data-less query exclusion_: a cache entry with no `data` is never picked, even if its `dataUpdatedAt` is newest.

## Relationships

- **`tests/structureSearchApi/_helpers/harness.ts`** – provides `makeSearchComposable`, `clearAllInstances`, `flush`, `newTestClient` (composable factory, teardown, microtask flush, fresh TanStack Query client).
- **`tests/structureSearchApi/_helpers/seedPages.ts`** – provides `seedPage`, which injects a synthetic search result into the query cache and returns the query key used.
- **`tests/structureRestApi/_helpers/fakeApi.ts`** – provides `deferred`, used to create a promise that never settles, keeping page 1 perpetually in flight.
- **`tests/structureRestApi/_helpers/time.ts`** – provides `BASE_NOW`, the fixed timestamp anchor for computing `dataUpdatedAt` values.
- **`src/composables/structureSearchApi.ts`** – source of the `ISearchResult` type imported for typing the deferred promise.

## Notes

- Page 1 is deliberately held in flight in every test, so the "current page" path for `totalItems` is never exercised here; only the freshest-cached-page fallback is tested.
- The "data-less query" test manually builds a query-cache entry via `getQueryCache().build(...).setState(...)` rather than using `seedPage`, because `seedPage` presumably always writes `data`.
- `seedPage` returns the constructed query key, which the data-less test reuses (slicing it) to fabricate a sibling key.
- Bucket-key matching is exact-segment: an applied search with no `key` will not match a cached entry that _has_ a key, and vice-versa.
