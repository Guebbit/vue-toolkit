---
source: tests/structureRestApi/lifecycle/maxRecords-protection.spec.ts
sha256: 67f812afe3cb3196c4901bbb4e6eb33775d0edc8ec73a375788f5a37b1298fed
generated_at: 2026-09-28T22:53:03.464645+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/lifecycle/maxRecords-protection.spec.ts

## Purpose

Complements `maxRecords.spec.ts` (which proves the bound _evicts_) by pinning the other half: what a wipe must leave alone. It locks in the invariants that alias entries don't count toward the bound, watched lists/targets and their backing records survive, in-flight queries are spared, scope isolation holds, and a bound ≤ 0 means "no bound."

## Key elements

- **`allKey(...key)`** – Builds the query key `['resource','all',[], ...key]` for an `all` list under the default empty scope, used to assert cache state.
- **`article(id)`** – Shorthand that returns a single `IArticle` with the given id via `buildArticles(1, 'tech', id)[0]`.
- **`afterEach(clearAllInstances)`** – Resets all composable instances between tests.
- **Test cases** (11 total, one `.each` for `0`/`-1`):
    - Alias entry does not count toward the bound.
    - Watched list rows survive by string id without re-fetch.
    - Watched list still loading (no data) doesn't break a crossing.
    - Watched alias whose record isn't loaded yet doesn't break a crossing.
    - Record behind a watched alias survives; alias still serves it.
    - Only the writing query is spared; a prefix-key lookalike is dropped.
    - Any observed query (list or target) is never dropped.
    - A list whose key segment matches a protected record id is still droppable.
    - In-flight query survives a wipe and resolves afterwards.
    - Another scope's queries are untouched and not counted toward the bound.
    - `maxRecords` of `0` or `-1` disables eviction entirely.

## Relationships

- **`_helpers/harness.ts`** – Supplies `makeComposable` (creates the composable under test), `clearAllInstances` (teardown), `flush` (microtask drain), and `newTestClient` (isolated query client for scope-isolation tests).
- **`_helpers/fakeApi.ts`** – `apiResolve` wraps a value in a resolved Promise for `fetchTarget`/`fetchAll`; `deferredApi` returns a controllable pending Promise pair for simulating in-flight requests.
- **`_helpers/fixtures.ts`** – `buildArticles(count, tag, startId)` generates deterministic `IArticle` arrays; `IArticle` is the entity type parameterized into every composable.
- **`package.json`** – Declares the `vue` and `jest` dev-dependencies this file imports.

## Notes

- The file explicitly states in its header that it is the _protection_ half of the maxRecords contract; read it alongside `maxRecords.spec.ts` for the full picture.
- Query keys use a positional convention: `['resource', 'all', <scope[]>, ...key]` and `['resource', 'target', <scope[]>, <id>]`. The `allKey` helper only covers the `all` shape.
- The "prefix match" test (`key: ['a','b']` vs `key: ['a']`) confirms that protection is exact-key, not prefix-based.
- `watched.stop()` is called at the end of each test that creates a watcher; forgetting it would leak observers across tests (mitigated by `clearAllInstances`, but the explicit stop documents intent).
