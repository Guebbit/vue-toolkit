---
source: tests/structureSearchApi/unit/fetchSearch.spec.ts
sha256: c5553e6edf0f7fc1029a0354960a160c88a670fb566e073b596bc8ed8960f7d8
generated_at: 2026-09-28T23:13:17.367399+00:00
model: ollama:qwen3.8:27b
---

# tests/structureSearchApi/unit/fetchSearch.spec.ts

## Purpose

Unit tests for the `fetchSearch` method of the search composable. They verify the direct contract: resolving with `ISearchResult<T>` (items + server-reported `totalItems`), caching the fetched page, recording the page→ids mapping, handling empty sets, re-throwing errors without polluting the cache, preserving `totalItems` across cache hits, and correctly applying page/pageSize so `pageItemList` reflects the just-fetched page.

## Key elements

- **`make()`** – factory calling `makeSearchComposable<IArticle, number>()` to get a fresh composable instance.
- **`TECH`** – fixture: 5 articles in category `'tech'` (via `buildArticles`).
- **`describe('UNIT · fetchSearch')`** – main suite covering resolve shape, dictionary storage, `searchGet` mapping, empty results, error re-throw, `totalItems` on cache hit, and page/pageSize application.
- **`describe('UNIT · fetchSearch applies the page it fetches')`** – suite focused on interaction with an active `watchSearch`: ensures the server is asked for exactly the requested page and that no stale page frame leaks into the rendered state.
- **`loggingServer()`** – local helper that records every `(filters, page, size)` call and returns a single-article page; used to assert no extra requests.
- **`pageOf(category, id)`** – shorthand for a one-article `apiResolve` page with `totalItems: 30`.
- **`afterEach(clearAllInstances)`** – disposes all composable instances between tests.

## Relationships

- **`tests/structureSearchApi/_helpers/harness.ts`** – supplies `makeSearchComposable`, `clearAllInstances`, and `flush` (Vue tick barrier). The entire test file is built on this harness.
- **`tests/structureRestApi/_helpers/fakeApi.ts`** – supplies `apiResolve` / `apiReject` used to stub the fetch callbacks.
- **`tests/structureRestApi/_helpers/fixtures.ts`** – supplies `buildArticles` and the `IArticle` type used as the generic parameter.
- **`package.json`** – project-level test runner configuration (vitest/jest globals like `describe`, `it`, `expect`, `afterEach` are resolved through it).

## Notes

- Tests that involve `watchSearch` call `flush()` (from the harness) to let Vue settle computed/watcher effects before asserting; without it, the "no extra request" checks would be racy.
- The "no frame shows a page left over" test registers a Vue `watch` _before_ the final `fetchSearch` call to simulate a same-flush render, then asserts the only frame seen is the new page.
- `it.each` parameterises two page-change scenarios (new filters from page 3; new page size from page 1) against the same logging-server assertion.
- Omitting the `size` argument to `fetchSearch` intentionally defaults to the current `pageSize`; the corresponding test confirms `checkSearch` and `searchGet` agree on the same page key.
