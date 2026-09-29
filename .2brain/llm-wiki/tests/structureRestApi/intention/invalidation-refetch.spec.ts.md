---
source: tests/structureRestApi/intention/invalidation-refetch.spec.ts
sha256: 88d444d1cc52533c11686d1403141bcb10827d1b7f78c2c34801f73c49ff26e2
generated_at: 2026-09-28T22:50:15.699368+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/intention/invalidation-refetch.spec.ts

## Purpose

Verifies a core design intention: an **active** `watch*` subscription genuinely **refetches** (issues a second API call) when `queryClient.invalidateQueries` fires for its resource key — rather than merely marking data stale and waiting for the next manual refetch. This ensures that create/update/delete mutations on the same resource, or invalidation from another store sharing the same `queryClient`, automatically refresh a screen that is currently open, with no imperative refetch call.

## Key elements

- **`describe('INTENTION · an active watch* refetches on invalidation')`** — the single top-level suite; contains six focused cases.
- **`makeComposable<IUser, number>({ resourceKey: 'orders' })`** — instantiates the SUT (the composable under test) with a fixed resource key for each case.
- **`c.watchAll(apiCall)` / `c.watchByParent(apiCall, 'team-1')`** — the active subscriptions whose refetch behaviour is under assertion.
- **`c.queryClient.invalidateQueries({ queryKey: [...] })`** — the invalidation trigger (external or self-mutation).
- **`c.createTarget` / `c.updateTarget` / `c.deleteTarget`** — the self-mutation paths that should invalidate their own resource's list.
- **`apiResolve(...)`** — wraps a plain object in a resolved promise to simulate a successful API response.
- **`USERS`, `buildUsers(n, startId)`** — fixture arrays of `IUser` records returned by the mock API calls.
- **`afterEach(clearAllInstances)`** — tears down all composable instances between tests.
- **`flush()`** — awaits microtask queue so Promises settle before assertions.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** — provides `makeComposable`, `clearAllInstances`, and `flush`; the entire test infrastructure for spinning up and tearing down composable instances.
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — provides `apiResolve`, used to wrap literal objects in `Promise.resolve` so they pass where the composable expects an API response.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — provides the `IUser` type, the `USERS` constant array, and `buildUsers(n, startId)` for generating variable-length user lists.

## Notes

- Each test asserts **call count** on a `jest.fn()` (`toHaveBeenCalledTimes(2)`), not merely that data changed — this is the key distinction from a "marked stale" implementation that would never increment the counter.
- The negative case (invalidating `'products'` while watching `'orders'`) guards against over-broad invalidation keys.
- The header comment points to a parallel intention test at `tests/structureSearchApi/intention/mutation-invalidation.spec.ts` for the search API variant.
- All tests use `resourceKey: 'orders'` for the SUT while the fixtures are `IUser` records — the key name is deliberately unrelated to the data shape; only the string key matters for invalidation.
