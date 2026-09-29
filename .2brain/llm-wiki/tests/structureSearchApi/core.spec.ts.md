---
source: tests/structureSearchApi/core.spec.ts
sha256: 595a0b4065bfa35b1daaa07ecc841867757795ec9892713479a1c269adfbe801
generated_at: 2026-09-28T23:08:34.032268+00:00
model: ollama:qwen3.8:27b
---

# tests/structureSearchApi/core.spec.ts

## Purpose

Spec for the `useStructureSearchApi` composable. It verifies that `pageItemList`, `totalItems`, and `pageTotal` are scoped to the **last applied search** (the filters passed to `fetchSearch`), not to the whole-dictionary offline pagination of the underlying restApi or to the live `filtersSource` ref. The tests exist to guard against the subtle bug where a shared item dictionary causes one search's records to leak into another search's paginated view.

## Key elements

- **`makeSearchComposable`** (imported) – factory that instantiates the composable under test with a configurable `filtersSource` and optional cache options.
- **`clearAllInstances`** (imported) – called in `afterEach` to tear down every composable instance between tests.
- **`flush`** (imported) – advances the microtask queue so `watchSearch`'s `immediate` effect settles.
- **`buildArticles` / `IArticle`** (imported from `structureRestApi` fixtures) – builds deterministic article arrays for assertions.
- **`pageItemList` suite** – four tests covering: correct scoping to last applied search, isolation from a prior unrelated search that shares the dictionary, page-current tracking on fetch, and _no_ reactive update when `filtersSource` is mutated without a new fetch.
- **`totalItems / pageTotal` suite** – verifies both reflect the last applied search and survive a TanStack-Query cache hit (API called once, values unchanged).
- **`isPageCached / isPaginateCached` suite** – confirms these query-methods report `false` before and `true` after the respective fetch has populated the query cache.
- **`watchSearch` suite** – checks the default `immediate: true` auto-fetch and the `immediate: false` + explicit `search()` on-demand path.

## Relationships

- **`tests/structureSearchApi/_helpers/harness.ts`** – provides `makeSearchComposable`, `clearAllInstances`, and `flush`; this spec is its primary consumer.
- **`tests/structureRestApi/_helpers/fixtures.ts`** – provides `buildArticles` and the `IArticle` type reused here to avoid duplicating fixture shapes across the two API test suites.

## Notes

- The central invariant under test: **applied ≠ live**. Mutating `filtersSource.value` must not shift the displayed list; only a subsequent `fetchSearch` call does. Any refactor that makes `pageItemList` a computed over the live filters will break the "does NOT update when filtersSource changes alone" test.
- `fetchSearch` is expected to set `pageCurrent` internally as a side-effect of the page argument—there is no separate assignment step.
- The `staleTime: 3_600_000` option passed to `makeSearchComposable` in the cache-hit test exercises TanStack Query's revalidation logic; without it the second call would re-fetch.
