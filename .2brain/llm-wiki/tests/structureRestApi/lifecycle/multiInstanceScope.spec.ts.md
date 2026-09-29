---
source: tests/structureRestApi/lifecycle/multiInstanceScope.spec.ts
sha256: 8be699070f17366160e2b0ff3014569f47b8159d2e2c154397f878eb0176884d
generated_at: 2026-09-28T22:53:33.242840+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/lifecycle/multiInstanceScope.spec.ts

## Purpose

Verifies that when two live instances share the same `resourceKey` (but sit under different `dependsOn` scopes), neither instance's start-up sweep nor its own scope-change drop accidentally evicts the other instance's cached data. It guards the "compare two shops side-by-side" and "master/detail on one scope" patterns described in the header comment.

## Key elements

- **`describe('LIFECYCLE · two instances of the same resourceKey under different scopes')`** — the single top-level block containing three test cases:
    - _Second instance's creation sweep preserves sibling's data_ — creates instance `a` on `scopeA`, fetches, then creates instance `b` on `scopeB` (same `resourceKey`, same `queryClient`). Asserts `a`'s cached record survives `b`'s initialization.
    - _Moving one instance's `dependsOn` does not drop a scope a sibling still shows_ — both instances start on `'shared-shop'`; `a` moves to `'other-shop'`. Asserts `b` still sees its record while `a`'s view is now scoped to the new value.
    - _A scope truly unclaimed is still dropped_ — single instance moves away from its scope; asserts the query cache entry for the old scope key is removed (length 0).
- **`afterEach(clearAllInstances)`** — tears down all tracked instances between tests to prevent cross-test contamination.

## Relationships

- **`src/composables/structureRestApi.ts`** — the composable under test (`useStructureRestApi`). Each test instantiates it via `runTracked`.
- **`tests/structureRestApi/_helpers/harness.ts`** — supplies `runTracked` (wraps composable creation and exposes `fetchTarget` / `getRecord`), `clearAllInstances`, `flush` (microtask/settled-promise drain), and `newTestClient` (a fresh `QueryClient` per test).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — `apiResolve` wraps a plain value into the resolved-fetch shape the composable expects.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — provides the `USERS` array and `IUser` type used as the resource payload.
- **`package.json`** — resolves `vue` (`ref`) and the test runner (Vitest globals `describe` / `it` / `expect` / `afterEach`).

## Notes

- The header comment references `src/internal/scopeRegistry.ts` as the mechanism that tracks which scopes a live instance still claims. That module is **not** directly imported here; the registry logic is exercised indirectly through the composable's sweep/drop paths.
- `flush()` must be awaited after any scope mutation or instance creation before asserting on cache state; omitting it makes the tests flaky because the sweep/drop is async.
- The third test inspects the raw `QueryCache` via `queryClient.getQueryCache().findAll({…})` with a hand-built `queryKey` (`['products', 'target', ['shared-shop'], '1']`). This is the only test that asserts on the _absence_ of a cache entry rather than the _presence_ of a record.
