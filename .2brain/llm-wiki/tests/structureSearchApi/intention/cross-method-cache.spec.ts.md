---
source: tests/structureSearchApi/intention/cross-method-cache.spec.ts
sha256: 5788785441a3b9189ee81d3750988cdba5863c0a36b1cdc58e263f3b28076831
generated_at: 2026-09-28T23:09:11.793694+00:00
model: ollama:qwen3.8:27b
---

# tests/structureSearchApi/intention/cross-method-cache.spec.ts

## Purpose

Intention test verifying that `fetchSearch` (search-API composable) seeds the same shared per-item target cache that `fetchAll` (REST-API composable) seeds. Because both methods operate on the identical list-query protocol, a `fetchSearch` call should make a subsequent `fetchTarget(id)` resolve from cache without an additional API request.

## Key elements

- **describe block `INTENTION · cross-method cache seeding (search)`** — scopes the single test to the search→target cross-method path.
- **Test `fetchSearch → fetchTarget(id) is served from cache`** — calls `fetchSearch` with a resolved list payload, then calls `fetchTarget` with a fresh `apiResolve` spy; asserts the spy was _not_ called (cache hit).
- **`afterEach(clearAllInstances)`** — tears down all composable instances between tests to prevent cross-test cache leakage.

## Relationships

- **`tests/structureSearchApi/_helpers/harness.ts`** — supplies `makeSearchComposable` (builds the search-API composable under test) and `clearAllInstances` (teardown).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — supplies `apiResolve`, which wraps a fixture in a call-tracking spy so the test can assert whether the cache actually short-circuited the network call.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — supplies `buildArticles` (deterministic `IArticle` arrays) and the `IArticle` type used as the generic parameter of the composable.

## Notes

- The test lives under `structureSearchApi` but deliberately reuses the **REST-API** helpers (`fakeApi`, `fixtures`). This is by design: the intention is that both API families share one target cache, so the fixtures and spy infrastructure are common.
- `apiResolve` is a spy factory, not a real network call; `expect(get).not.toHaveBeenCalled()` is the assertion mechanism for "served from cache."
- The file's header comment cross-references `tests/structureRestApi/intention/cross-method-cache.spec.ts` as the canonical seed (the `fetchAll` side); this file is the mirror on the search side.
