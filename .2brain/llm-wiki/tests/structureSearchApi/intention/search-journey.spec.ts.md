---
source: tests/structureSearchApi/intention/search-journey.spec.ts
sha256: 4763b8c9359079286645be642841c5280bea44ad870a3470b2c2b852aa498535
generated_at: 2026-09-28T23:09:42.575157+00:00
model: ollama:qwen3.8:27b
---

# tests/structureSearchApi/intention/search-journey.spec.ts

## Purpose

Integration-level test that simulates a realistic search-as-you-type session against a fake server with a fake clock. It asserts the **exact number of server round-trips** at each step to verify that the search cache collapses redundant identical queries while still refetching once the stale window expires.

## Key elements

- **`searchCall(server, predicate, page, pageSize, total)`** — Adapter that wraps `createServer`'s bare-array `search()` into the `{ items, totalItems }` shape expected by `fetchSearch`. `totalItems` is the full predicate match count, independent of the requested page.
- **`make(staleTime)`** — Convenience factory around `makeSearchComposable` with the default `STALE_TIME` of 10 s.
- **`TECH` / `SPORT`** — Pre-built fixture article arrays (8 and 4 items) used as the fake server's data set.
- **`isTech` / `isSport`** — Predicate functions filtering by category.
- **Test 1: "collapses repeated queries but refetches once stale"** — Drives a 7-step journey (type → refine → revert → scroll → switch category → expire → re-query) and asserts `server.calls.search` equals exactly 1, 2, 2, 3, 4, 5, 5.
- **Test 2: "keeps every distinct (query, page, pageSize) result independently retrievable"** — Fetches three different (query, page, pageSize) combos and confirms `searchGet` returns the correct sliced items for each without cross-contamination.
- **`beforeEach` / `afterEach`** — Installs fake clock, clears all composable instances, and restores the real clock.

## Relationships

- **`tests/structureSearchApi/_helpers/harness.ts`** — Provides `makeSearchComposable` (the unit under test) and `clearAllInstances` (teardown).
- **`tests/structureRestApi/_helpers/fakeServer.ts`** — Provides `createServer`, the in-memory server whose `calls.search` counter is the primary assertion target.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — Provides `buildArticles` and the `IArticle` type used to seed the fake server.
- **`tests/structureRestApi/_helpers/time.ts`** — Provides `useFakeClock`, `advance`, and `restoreClock` to deterministically control the stale window.

## Notes

- The file reuses REST-layer helpers (`fakeServer`, `fixtures`, `time`) rather than search-specific ones — only `harness` is search-specific.
- `searchCall` is necessary because `createServer.search()` resolves a plain array, but the search composable's `fetchSearch` expects `ISearchResult<T>` (`{ items, totalItems }`). Without this wrapper the shapes don't line up.
- All timing assertions depend on the fake clock; running without it (or with a different `staleTime`) would break the exact call-count expectations.
