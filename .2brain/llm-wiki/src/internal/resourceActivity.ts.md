---
source: src/internal/resourceActivity.ts
sha256: 7f6c373b7b940be909ea788da6af08ba41b676d0860f617f69a939737ef21ed7
generated_at: 2026-09-28T22:35:29.007193+00:00
model: ollama:qwen3.8:27b
---

# src/internal/resourceActivity.ts

## Purpose

Bridges TanStack Query's non-reactive query/mutation caches to Vue's reactivity system. Subscribes to cache events and bumps per-kind data counters and status counters so that components and stores can reactively track when cached data changes or when operations are in flight, without polling.

## Key elements

- **`useResourceActivity(queryClient, resourceKey, resolveId)`** — the sole export. Subscribes to the query and mutation caches scoped to one resource and returns `{ version, isLoading, loading, isSaving }`.
- **`version(kind)`** — returns a readonly reactive counter that increments whenever an entry of that kind receives new data or leaves the cache.
- **`isLoading(key?)`** — plain function; true if any query or mutation of this resource whose meta-key starts with `key` is in flight. Must be called inside a `computed` to be reactive.
- **`loading`** — `computed(() => isLoading())`; a ready-made reactive "anything in flight" flag.
- **`isSaving(id)`** — plain function; true while an update or delete mutation on the resolved record `id` is pending. Create is deliberately excluded (no stable id yet).
- **`changesData(event)`** — internal predicate: an event counts as a data change if it's `removed`, an `updated` with a `success`/`setState` action, or an `added` that already carries data.
- **`STATUS_EVENTS`** — `{'added','removed','updated'}`; the only cache events that bump status counters.
- **`DATA_ACTIONS`** — `{'success','setState'}`; the query actions that actually mutate entry data.
- **`keyOf(meta)`** — extracts the caller-supplied key segments from TanStack's `meta` bag.

## Relationships

- **`src/internal/plainData.ts`** — provides `hasKeyPrefix`, used by `isLoading` and `isSaving` to match key prefixes.
- **`src/internal/resourceKeys.ts`** — provides the `TResourceKind` type used as the parameter of `version()`.
- **`src/internal/recordMutations.ts`** — provides `recordMutationsOf`, called by `isSaving` to find the specific mutation for a record id.
- **`src/internal/restResource.ts`** — the caller that builds queries/mutations whose `meta.key` and resolved-id conventions this module reads; the alias rule in `restResource.ts`'s header guarantees `isSaving` sees the same id the mutation key was built from.
- **`tests/internal/resourceActivity.spec.ts`** — unit tests for this module.
- **`tests/package/smoke.mjs`** — end-to-end smoke test that exercises the reactivity chain through this file.

## Notes

- Counters are **generation tokens**: only that they moved matters, not by how much. Stryker mutation-disable comments mark each `++` accordingly.
- `isLoading` and `isSaving` are plain functions, **not** computed refs. They read the reactive counters internally (`void queryStatus.value` / `void mutationStatus.value`) so a surrounding `computed` re-evaluates, but they are not themselves reactive.
- The `added`-with-data branch in `changesData` exists because `hydrate()` / `persistQueryClient` restore inserts entries that already hold data without ever firing an `updated`/`success` action.
- `resolveId` is a **lazy reference**: the record store that owns it is built _after_ this module (it needs `version`), so the closure stores the function and only calls it when `isSaving` is invoked.
- Subscriptions are auto-cleaned via `onScopeDispose` when called inside a Vue effect scope (component setup, Pinia store). Outside a scope they live as long as the `QueryClient`.
- `observer*` cache events are intentionally ignored — they only track `useQuery` mounts and option changes, not data or status.
