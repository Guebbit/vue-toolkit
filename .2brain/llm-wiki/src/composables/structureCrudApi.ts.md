---
source: src/composables/structureCrudApi.ts
sha256: ca3126e6ae99adfd75e9ee108d1744c76d156d8b8c44e16774ef52277ee64f63
generated_at: 2026-09-28T22:29:56.677509+00:00
model: ollama:qwen3.8:27b
---

# src/composables/structureCrudApi.ts

## Purpose

A Vue composable (`useStructureCrudApi`) that turns a set of optional API callbacks (list, search, get, create, update, remove) into a complete, ready-to-use CRUD resource. It wires each supplied operation into a corresponding method on top of `useStructureSearchApi`, and rejects (with a named-error `Promise.reject`) any method whose operation was never provided. It exists so screens don't re-implement filter state, pagination, selection, or optimistic-write plumbing per resource.

## Key elements

- **`IStructureCrudOperations<T,K,F,C,U,O>`** — the input object; every field is optional. `list`, `search`, `get`, `create`, `update`, `remove` each map to one or more returned methods. `optimisticPatch` (optional) converts the update payload into the local patch before `updateOne` applies it.
- **`IStructureCrudApiOptions<F>`** — extends `IStructureRestApiOptions` with `initialFilters` (the starting/reset value of the live `filters` ref).
- **`useStructureCrudApi(operations, settings)`** — the main export. Returns an `IStructureCrudApi` with:
    - **Read / list:** `fetchList`, `fetchPage` (unfiltered single page), `watchList` (reactive filtered search).
    - **Search controls:** `filters` (live `Ref<F>`, editable in place), `searchNow` (apply current filters from page 1), `resetFilters` (restore initial copy, then forced search).
    - **Single record:** `fetchOne` (fetch + select; unselects on failure unless another id was selected meanwhile), `watchOne` (reactive variant).
    - **Write:** `createOne`, `updateOne`, `deleteOne` — each accepts a settings bag (`requestOptions`, `dummyData`/`key`/`merge`/`applyResponse` as applicable).
- **`withOperation`** (internal) — uniform guard: resolves if the operation exists, otherwise returns `Promise.reject(new Error(...))` so the failure flows through the same `.catch` as a network error.
- **`toPatch`** (internal) — resolves the local patch for `updateOne` via `optimisticPatch` or falls back to the raw payload.
- **`initialCopy()`** (internal) — deep-copies `initialFilters` through `detachedCopy` so the live `filters` ref never shares objects with the initial value.

## Relationships

- **`structureSearchApi.ts`** — directly composes `useStructureSearchApi`; re-exports and builds on its types (`ISearchResult`, `IStructureSearchApi`, `IWatchSearchHandle`, `IWatchSearchSettings`). All read/search/watch methods delegate to that composable.
- **`structureRestApi.ts`** — source of shared settings/context types: `IFetchContext`, `IFetchSettings`, `IStructureRestApiOptions` (which `IStructureCrudApiOptions` extends), `IUpdateTargetSettings`, `IWatchTargetSettings`.
- **`structureDataManagement.ts`** — provides the `TIdOf<T>` type used as the default for the `K` type parameter.
- **`plainData.ts`** — provides `detachedCopy`, used to clone `initialFilters` into the live `filters` ref.
- **`src/index.ts`** — public re-export surface for this module.
- **`tests/structureCrudApi/core.spec.ts`** — covers the main CRUD method behaviours.
- **`tests/structureCrudApi/filters.spec.ts`** — covers filter lifecycle (initial copy, `searchNow`, `resetFilters`).
- **`tests/structureRestApi/intention/deep-scan-regressions.spec.ts`** — regression tests that exercise CRUD paths alongside the lower-level REST composable.
- **`tests/types/structureCrudApi.test-d.ts`** — compile-time type assertions for the composable's generic signatures.

## Notes

- Missing operations **reject** (async) rather than throwing synchronously; callers must handle them in `.catch` just like a failed HTTP call.
- `filters` is a live `Ref` that forms edit in place; changing it does **not** trigger a search. You must call `searchNow()` (or `watchList`'s `search()`) to apply.
- `searchNow` captures the operation's `context` (frozen filters/page) at call time so that a later TanStack re-run of the same `queryFn` asks the same question again — it does **not** re-read live `filters`/`pageSize` on re-run.
- `resetFilters` always passes `forced: true` to bypass the cache.
- `fetchOne` sets `selectedIdentifier` _before_ the fetch so a cached record renders immediately; it only unselects on failure if no other id was selected in the meantime.
- `fetchPage` goes through `fetchPaginate` and **discards** the search total — it is intentionally unfiltered and total-less.
- The `O` type parameter is the per-call options bag forwarded verbatim to your HTTP client (e.g. axios config, `AbortSignal`); it is not interpreted by this composable.
