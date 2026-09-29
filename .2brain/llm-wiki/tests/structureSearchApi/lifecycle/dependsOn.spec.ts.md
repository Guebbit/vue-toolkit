---
source: tests/structureSearchApi/lifecycle/dependsOn.spec.ts
sha256: abb37e0761631f409945b9fdb654da7b42c7ad675e5ca87880fd6bbc69fee987
generated_at: 2026-09-28T23:10:05.150975+00:00
model: ollama:qwen3.8:27b
---

# tests/structureSearchApi/lifecycle/dependsOn.spec.ts

## Purpose

Verifies that search pages behave correctly under scope changes driven by `dependsOn` and under `resetAll()`. It asserts cache invalidation on scope switch, that a late-landing answer is not mis-cached into a sibling's still-active scope, that a cancelled `fetchSearch` never cross-contaminates totals, and that `resetAll()` empties the view and cache.

## Key elements

- **`describe('LIFECYCLE · search and dependsOn')`** — Single-instance test: changing the `locale` ref re-triggers `watchSearch` under the new scope and evicts the old scope's cache entry (verified via `queryClient.getQueryCache().findAll`).
- **`describe('…two instances on one client')`** — Two composables share one `queryClient`. Instance A switches away from `'en'`; instance B stays on `'en'`. A deferred answer resolving after A's switch must not be stored as an empty page under B's scope.
- **`describe('…a fetchSearch cut short by a dependsOn change')`** — A pending `fetchSearch` is in-flight when `dependsOn` changes; the promise resolves with `{ items: [], totalItems: 0 }` rather than the original (now-orphaned) payload.
- **`describe('LIFECYCLE · search and resetAll')`** — After a successful `fetchSearch`, calling `resetAll()` clears `pageItemList`, zeroes `totalItems`, and makes `checkSearch` report a miss.
- **`afterEach(clearAllInstances)`** — Global teardown that destroys all composable instances between tests.

## Relationships

- **`src/composables/structureSearchApi.ts`** — Type-only import of `ISearchResult`; the composable itself is instantiated indirectly through the harness.
- **`tests/structureSearchApi/_helpers/harness.ts`** — Supplies `makeSearchComposable` (creates the composable under test with configurable `dependsOn`), `clearAllInstances`, `flush` (microtask drain), and `newTestClient` (fresh QueryClient per multi-instance test).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — Supplies `apiResolve` (wraps a value in a resolved promise for `fetchSearch`) and `deferred` (manually-controlled promise used to stage mid-flight cancellations).
- **`tests/structureRestApi/_helpers/fixtures.ts`** — Supplies `buildArticles(n, category, idOffset)` to generate `IArticle` arrays whose `category` field encodes the locale, making scope leakage visible in assertions.

## Notes

- The query-key layout is `['resource', 'search', <scopeArray>]`; tests inspect `queryKey[2]` directly to assert which scope's page remains in the cache.
- `buildArticles(2, 'en')` sets `category = 'en'` on every article, so `pageItemList.map(a => a.category)` is the primary way to confirm which scope's data is currently displayed.
- Multi-instance tests explicitly share one `queryClient` (via `newTestClient()`); single-instance tests use the default client the harness creates. Omitting the shared client would make cross-instance assertions meaningless.
- The "cut short" test pre-populates the `'fr'` scope cache via sibling B so that the resolution path actually hits a cached entry—without that setup the test would pass trivially.
