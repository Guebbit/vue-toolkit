---
source: tests/structureSearchApi/lifecycle/maxRecords.spec.ts
sha256: c1fd06b4f4092589c0963300b41245197b464fcdf63750362e324fe10b84c8af
generated_at: 2026-09-28T23:10:17.454568+00:00
model: ollama:qwen3.8:27b
---

# tests/structureSearchApi/lifecycle/maxRecords.spec.ts

## Purpose

Verifies that when a `maxRecords` bound is crossed, the search API's page/index view (`searchGet` / `pageItemList` / `totalItems`) is fully wiped alongside all other cached queries. This exists to pin down the invariant that the search view is a **read-only projection over the same QueryClient** as the record store — there is no separate search index to prune independently.

## Key elements

- **`describe('LIFECYCLE · maxRecords and searchApi')`** — single test block.
- **`it('a maxRecords wipe empties the search view too…')`** — the sole test case. Seeds 8 articles into the search cache (under the `maxRecords: 10` limit), then triggers an unrelated `fetchAll` of 5 articles that crosses the bound. Asserts the search view collapses to empty and the resource ends up holding only the incoming batch.
- **`afterEach(clearAllInstances)`** — global cleanup via the search harness.

## Relationships

- **`../_helpers/harness`** (`makeSearchComposable`, `clearAllInstances`) — provides the composable under test and instance teardown.
- **`../../structureRestApi/_helpers/fakeApi`** (`apiResolve`) — wraps synchronous responses into the fake API promise shape expected by the composable.
- **`../../structureRestApi/_helpers/fixtures`** (`buildArticles`, `IArticle`) — generates deterministic article arrays for the two categories (`tech`, `sport`) used in the scenario.
- **`tests/structureRestApi/_helpers/harness`** — not imported directly here, but the `fakeApi` and `fixtures` it co-locates are shared; this file relies on those REST-side helpers rather than duplicating them in the search-side directory.

## Notes

- The file's header comment explicitly contrasts with `tests/structureRestApi/lifecycle/maxRecords.spec.ts`; that sibling test exercises the _record_ store wipe, while this one asserts the _derived search view_ vanishes as a consequence.
- `maxRecords` is described as "the only bound" — there is no independent search-page eviction policy to test here.
- The crossing fetch (`fetchAll`) writes into the cache _after_ the wipe, which is why `itemList` ends up with exactly the 5 incoming articles rather than a mixed result.
