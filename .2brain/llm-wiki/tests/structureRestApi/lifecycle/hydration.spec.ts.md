---
source: tests/structureRestApi/lifecycle/hydration.spec.ts
sha256: fbd64e3a917fe2b344188932c2363c507ab185474a903de68da1110817cc4a54
generated_at: 2026-09-28T22:51:54.572318+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/lifecycle/hydration.spec.ts

## Purpose

Verifies that `@tanstack/vue-query`'s `hydrate()` — the mechanism `persistQueryClient` uses to restore a cached state on app boot — correctly propagates data into the view layer (`getRecord`, `itemList`). It guards against a subtle bug where hydrated entries only fire an `added` cache event (never `updated`/`success`), and the record view's computed dictionary depends on a data counter that must increment on `added` events to avoid staying stale.

## Key elements

- **`describe('LIFECYCLE · restoring a persisted cache with hydrate()')`** — single test block scoped to the hydration restore path.
- **`it('a hydrated record reaches getRecord/itemList without any other cache event')`** — the sole test case. It seeds a _source_ `QueryClient`, calls `dehydrate(source)`, then applies the snapshot to a _fresh_ `QueryClient` via `hydrate()`, and asserts `c.getRecord(1)` and `c.itemList.value` reflect the seeded record.
- **`afterEach(clearAllInstances)`** — tears down all composable instances between tests to prevent cross-test cache leakage.

## Relationships

- **`_helpers/harness.ts`** — supplies `makeComposable` (wraps the composable under test with a given `QueryClient`), `newTestClient` (a clean `QueryClient` for the "booted" instance), and `clearAllInstances` (global cleanup).
- **`_helpers/fakeApi.ts`** — provides `apiResolve`, used to synchronously resolve a fixture value so the seeder's `fetchTarget` completes without a real network call.
- **`_helpers/fixtures.ts`** — provides the `USERS` array and the `IUser` type, which serve as the known-good data flowing through the dehydrate → hydrate cycle.

## Notes

- The top-of-file doc comment is the critical context: a `Query` constructed from a dehydrated snapshot bypasses `.setData()`, so **only** an `added` cache event fires. The record view's computed is keyed on a data counter (bumped in `resourceActivity.ts`) that must count `added`-with-data events; if it doesn't, the dictionary stays at its stale value until an unrelated change touches the same query kind. This file exists specifically to pin that behavior.
- Two `QueryClient` instances are used deliberately: the "source" stands in for what `persistQueryClient` would have written to storage, the "fresh" one stands in for a cold boot. Never conflate them in a future refactor.
