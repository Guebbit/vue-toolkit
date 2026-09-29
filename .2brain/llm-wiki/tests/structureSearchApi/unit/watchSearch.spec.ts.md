---
source: tests/structureSearchApi/unit/watchSearch.spec.ts
sha256: 2f6518eca91881d03033a4e564fa758a5dbc109f2e767c8808fadac33ff4a5e3
generated_at: 2026-09-28T23:13:49.704103+00:00
model: ollama:qwen3.8:27b
---

# tests/structureSearchApi/unit/watchSearch.spec.ts

## Purpose

Unit tests for the `watchSearch` method on the `useStructureSearchApi` composable. Verifies its reactive fetch behaviour (immediate run, page/pageSize watchers, applied-vs-live filter semantics), the on-demand `search()` / `search(true)` API, lifecycle callbacks (`onSuccess`, `onError`, `onSettled`), and `stop()` / `refetch()` edge cases.

## Key elements

- **`make(initialFilters?)`** – local factory that calls `makeSearchComposable` (from the search-API harness) with a default `{ category: 'tech' }` filter and returns a tracked composable instance.
- **`TECH`** – fixed fixture array of 5 articles built via `buildArticles(5, 'tech', 1)`.
- **`fakeApiCall(items?)`** – returns a `jest.fn` that resolves `{ items, totalItems }`, recording every `(filters, page, pageSize, context)` invocation for assertion.
- **`anyContext`** – reusable `expect.objectContaining({ signal: expect.any(AbortSignal) })` matcher for the trailing context argument.
- **`describe('UNIT · watchSearch')`** – 16 tests covering: immediate fetch, getter-bound `filtersSource`, `immediate: false`, pageCurrent/pageSize refetch (including pageSize reset-to-page-1), applied-filter persistence across paging, no auto-refetch on filter change, `search()` / `search(true)` caching & forcing, callback firing for automatic and explicit runs, rejection handling with/without callbacks, and `stop()`.
- **`describe('UNIT · watchSearch refetch')`** – tests `refetch()` behaviour, including resolving from cache when the underlying fetch rejects.

## Relationships

- **`src/composables/structureSearchApi.ts`** – imports `useStructureSearchApi`; the entire spec exercises its `watchSearch`, `search`, `stop`, `refetch`, `pageCurrent`, `pageSize`, `getRecord`, and `filters` surface.
- **`tests/structureSearchApi/_helpers/harness.ts`** – provides `runTracked`, `makeSearchComposable`, `clearAllInstances`, `flush`, `newTestClient`, and `DEFAULT_STALE_TIME`; the spec is built entirely on top of these utilities.
- **`tests/structureRestApi/_helpers/fixtures.ts`** – provides the `IArticle` type and the `buildArticles` factory used to construct the `TECH` fixture.

## Notes

- Tests rely on `flush()` (a microtask drain from the harness) after every reactive mutation before asserting; omitting it causes stale-call counts.
- `afterEach(clearAllInstances)` resets the tracked composable registry between tests; the `runTracked` wrapper in the harness is what makes this cleanup possible.
- The "applied vs live filters" contract is central: `watchSearch` reads filters once at construction (or at `search()` call time) and does **not** watch them. Subsequent page changes reuse the originally applied snapshot.
- `search()` and `search(true)` both resolve `undefined` on rejection (they never throw); callbacks are optional-chained internally.
- The `pageSize`-change test explicitly asserts that only **one** call is made with the new size and page 1, guarding against a double-fetch from the two watcher firings.
