---
source: tests/structureRestApi/intention/resource-isolation.spec.ts
sha256: cbe772077c0ed40d27e9fcbc47dc663e98a4df2b4beb58c70eedb340a2c099bc
generated_at: 2026-09-28T22:51:06.808834+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/intention/resource-isolation.spec.ts

## Purpose

Verifies that two resources sharing a single `QueryClient` stay fully isolated from each other. Every mechanism that scopes by `resourceKey`—list views, parent/child links, loading state, invalidation, resets, and `dependsOn` teardown—is proven to respect the boundary. The file targets the class of bugs that single-resource tests cannot catch: a subscription or scan that forgets to filter by `resourceKey` would pass if nothing else is in the client.

## Key elements

- **`makeTwo()`** — local factory that creates one shared `queryClient` plus two composables (`users`, `products`) with distinct `resourceKey`s and default (empty-array) `dependsOn`.
- **`describe('INTENTION · two resources sharing one client stay isolated')`** — seven focused assertions:
    - _view isolation_: `itemList` / `getRecord` never cross-contaminate even with colliding IDs.
    - _parentHasMany isolation_: `fetchByParent` / `getListByParent` on the same parent key don't mix.
    - _isLoading (fetch)_: a pending `fetchAll` on one resource leaves the other's `isLoading()` `false`.
    - _isLoading (mutation)_: same guarantee for `mutateAny`.
    - _createTarget invalidation_: `users.createTarget` refetches users' watched list but not products'.
    - _resetAll_: clearing one resource's records and list entry leaves the other intact.
    - _dependsOn teardown (non-colliding)_: changing users' `dependsOn` ref tears down users' data but not products'.
    - _dependsOn teardown (colliding)_: products is deliberately pinned to the same literal value (`'alice'`) as users' old `dependsOn`; the test asserts the teardown predicate still requires a matching `resourceKey`, not just a matching value.
- **`afterEach(clearAllInstances)`** — global cleanup between tests.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** — supplies `makeComposable`, `clearAllInstances`, `flush`, and `newTestClient`; the composable under test is constructed here.
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — supplies `deferredApi`, used to hold a promise in-flight so `isLoading()` can be observed mid-request.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — supplies `USERS`, `buildProducts`, and the `IUser` / `IProduct` types used as the two resource shapes.
- **`package.json`** — project root; declares the test runner (Jest) and the `vue` / `@tanstack/vue-query` dependencies that back the harness.

## Notes

- Two resources are deliberately given the **same default `dependsOn`** (`() => []`) so that `resourceKey` is the _only_ distinguishing factor—this is the sharpest isolation scenario.
- The final test (`colliding dependsOn`) exists specifically to catch a teardown predicate that checks the `dependsOn` value without also requiring a `resourceKey` match; non-colliding values can't expose that bug.
- The `createTarget` test uses `jest.fn` spies and manual `watchAll` calls, then asserts exact call counts to detect cross-resource invalidation.
- `flush()` is awaited after every mutation/invalidation to let the query scheduler settle before assertions.
