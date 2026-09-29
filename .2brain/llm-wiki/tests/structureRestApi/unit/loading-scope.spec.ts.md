---
source: tests/structureRestApi/unit/loading-scope.spec.ts
sha256: b5c621eb58b708f5e226dccf966767612d471a1269e69468168458d5620017bb
generated_at: 2026-09-28T23:04:12.852111+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/loading-scope.spec.ts

## Purpose

Unit tests for the loading surface of a resource composable: the boolean `loading` flag (true while _any_ request for the resource is in flight) and `isLoading(key)` (resolves true when a call's key matches by **prefix**, the same rule used by `useIsLoading` and the core store). A second block asserts cache-lifetime defaults (`gcTime`) so that records, parent lists, and search pages never expire unobserved while other list kinds keep TanStack Query defaults.

## Key elements

- **`describe('UNIT · loading')`** — two tests:
    - _loading true while anything in flight_: fires a `fetchAny` with a deferred promise, asserts `c.loading.value === true`, resolves, asserts `false`.
    - _isLoading(key) prefix match_: fires a `mutateAny` keyed `['dash','w1']`; verifies `isLoading(['dash'])`, `isLoading(['dash','w1'])`, and `isLoading(['cart'])` react correctly via `computed` refs, then clears after resolution.
- **`describe('UNIT · cache lifetime defaults')`** — one test that reads `c.queryClient.getQueryDefaults(key).gcTime` for six key shapes and asserts `Infinity` for target records, parent lists, and search pages, and `undefined` (TanStack default) for `all`, `page`, and `any` lists.
- **`afterEach(clearAllInstances)`** — resets all composable instances between tests.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** — supplies `makeComposable` (builds a fresh composable instance), `clearAllInstances` (teardown), and `flush` (advances microtask queue for Vue reactivity).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — supplies `deferredApi`, which returns a `{ call, control }` pair: `call` is a promise-based function suitable for `fetchAny`/`mutateAny`, `control.resolve()` lets the test release the pending request on demand.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — supplies the `IUser` type used as the composable's resource generic.
- **`package.json`** — provides the test runner, Vue, and TanStack Query packages consumed transitively.

## Notes

- `isLoading` uses **prefix** matching, not equality: `['dash']` matches an in-flight `['dash','w1']`. The test explicitly verifies a non-matching key (`['cart']`) returns `false`.
- The key-shape convention (e.g. `['resource','target',[],'1']`) encodes the list kind in the second element; `gcTime: Infinity` applies to `target`, `parent`, and `search` kinds only.
- The test relies on `computed` reactivity to observe `isLoading` changes without manual subscription—this mirrors how a real component would use the ref.
