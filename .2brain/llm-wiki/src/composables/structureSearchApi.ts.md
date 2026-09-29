---
source: src/composables/structureSearchApi.ts
sha256: b21d66fc54c4f113fbe5fee9d20553e620846f0e9d7bc7f052533e4c5e623509
generated_at: 2026-09-28T22:31:37.547666+00:00
model: ollama:qwen3.8:27b
---

# src/composables/structureSearchApi.ts

## Purpose

Adds filtered, server-paginated search on top of a REST resource. The screen follows the **applied search** — a detached, immutable copy of the filters taken when a search runs — so a live form bound to the same filters does not shift the visible list while the user types.

## Key elements

- **`useStructureSearchApi(filtersSource, settings)`** — the main composable; returns `IStructureSearchApi`, which extends `IStructureRestApi` with search-specific members and redefines `pageItemList` / `pageTotal` to track the applied search.
- **`IStructureSearchApi<T, K, P, F>`** — the full public interface: `searchGet`, `fetchSearch`, `checkSearch`, `isPageCached`, `isPaginateCached`, `watchSearch`, `totalItems`, `isPlaceholder`, plus the redefined `pageItemList` and `pageTotal`.
- **`ISearchResult<T>`** — shape of one search page: `items` + `totalItems` (server-reported grand total).
- **`ISearchFetchContext<F>`** — extends `IFetchContext` with frozen `filters`, `page`, `pageSize`; passed as the last arg to `apiCall` so TanStack Query's re-run on unrelated invalidation re-asks the same question rather than reading live reactive state.
- **`IWatchSearchHandle<T>`** — returned by `watchSearch`; adds a `search(forced?)` method on top of the standard `IWatchHandle`.
- **`IWatchSearchSettings<T, F>`** — fetch settings + `immediate` (default `true`) + optional TanStack `queryOptions`.
- **`ISearchCacheEntry<K>`** (internal) — extends `IListCacheEntry<K>` with `totalItems`.
- **`IAppliedSearch<F>`** (internal) — the detached filters + optional bucket key currently driving the display.
- **`IShownEntry<K>`** (internal) — the last page actually rendered, tagged with a scope string so a `dependsOn` change or `resetAll()` starts the placeholder fresh.
- **`applySearch`** (internal) — replaces the applied search with a `detachedCopy`; skips the assignment when `stableKey` matches.
- **`searchQueryKey`** (internal) — builds the TanStack query key: `[resourceKey, 'search', dependsOn, stableKey(filters), pageSize, page, …key]`.
- **`settledResult`** (internal) — small helper: returns `undefined` on failure, otherwise reads the current page.

## Relationships

- **`src/internal/restResource.ts`** — calls `createRestResource` to build the underlying resource, cache, and `dependsOn` machinery that search pages are stored in.
- **`src/internal/plainData.ts`** — uses `detachedCopy` (immutable filter snapshot) and `stableKey` (order-independent string for cache-key equality).
- **`src/internal/resourceKeys.ts`** — extends `IListCacheEntry` to add `totalItems`; uses `keys.entry` / `keys.inScope` for query-key construction and scoping.
- **`src/internal/settleCallbacks.ts`** — calls `watchSettled` to drive the `watchSearch` lifecycle.
- **`src/composables/structureRestApi.ts`** — imports all shared types (`IFetchContext`, `IFetchSettings`, `IStructureRestApi`, `IStructureRestApiOptions`, `ITanStackQueryOptions`, `IWatchCallbacks`, `IWatchHandle`) and extends the REST API surface.
- **`src/composables/structureDataManagement.ts`** — imports the `TIdOf` type for the default key generic.
- **`src/index.ts`** — re-exports the public API of this module.
- **`tests/structureSearchApi/`** — dedicated spec tree (applied-search, lifecycle, search.latestPage) exercising the composable through a shared `harness.ts`.

## Notes

- **Applied vs. live filters.** The displayed list never reads the reactive `filtersSource` directly; it reads `applied.value`. This is intentional so a form bound to the source can mutate without moving the list.
- **TanStack re-run safety.** `ISearchFetchContext` exists because TanStack Query replays the last `apiCall` on unrelated invalidation. Reading `filters`/`page`/`pageSize` from that frozen context (rather than from live refs) keeps the replay idempotent. An `apiCall` typed with only `IFetchContext` still compiles — it just ignores the extra fields.
- **Placeholder semantics.** `pageItemList` keeps the most recently cached page on screen while the current page/size/filters combo is loading. `isPlaceholder` is the only way to tell "stale-but-shown" apart from a genuine empty result.
- **Scope tagging.** `IShownEntry.scope` encodes `dependsOn` + a reset generation so that a dependency change or `resetAll()` discards the placeholder instead of leaking rows from the old scope.
- **Cache key layout.** The 4th element of the query key is `stableKey(filters)` (a string), the 5th is `pageSize`, the 6th is `page`. `isPageOf` relies on this exact ordering when matching queries.
