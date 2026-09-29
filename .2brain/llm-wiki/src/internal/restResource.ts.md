---
source: src/internal/restResource.ts
sha256: c2f7a9351cc432b1380e1fb2ca952e7234e880439553b734995f23bcaeae51e2
generated_at: 2026-09-28T22:36:57.294149+00:00
model: ollama:qwen3.8:27b
---

# src/internal/restResource.ts

## Purpose

Core implementation of the `useStructureRestApi` composable. It assembles the key layout, in-flight tracking, record store, parent relations, and three operation kinds (one-shot reads, active reactive reads, mutations) on top of a single TanStack Vue Query `QueryClient`. It also produces the internal `engine` that `useStructureSearchApi` uses to build its `'search'` query kind.

## Key elements

- **`createRestResource`** (main export) – Factory that wires together keys, activity, record store, relation store, scope registry, freshness checks, and mutations. Returns `{ api, engine }`; `api` is the public surface, `engine` is shared internally by the search layer.
- **`IRunningQuery`** – Shape passed to query functions: `queryKey`, `meta`, `isCancelled()`, and a lazily-read `signal`.
- **`runningQueryOf`** – Adapts a TanStack query-function context into an `IRunningQuery`; keeps `signal` as a getter so abort wiring is not forced unless the caller reads it.
- **`readContextOf`** – Builds the `{ signal }` `IFetchContext` handed to the caller's `apiCall` from any source exposing a lazy signal.
- **`IWatchQueryOptions<E>`** – Configuration for an active (reactive) query: reactive key, meta, fetch, enabled, forced, staleTime, caller key, and per-call TanStack options.
- **`TListExtra<K>`** – Type for a function that computes extra data alongside a list's ids.
- **`nothing`** – Sentinel for a cancelled throwaway read that has no cache entry.
- **`warnedNoScope`** – Set tracking resource keys already warned about being built outside an effect scope (one-time console warning per key).

## Relationships

- **`resourceKeys.ts`** – Provides `createResourceKeys`, `LIST_KINDS`, and key/scope predicate helpers; defines the key layout the entire resource is built on.
- **`resourceActivity.ts`** – `useResourceActivity` tracks what is in flight and when data changes for this resource.
- **`queryRecordStore.ts`** – `createQueryRecordStore` is the record store (TanStack queries under the hood); also owns `resolve`/`keyOf` pointer-following logic.
- **`parentRelations.ts`** – `createQueryRelationStore` stores parent→child relations as TanStack queries.
- **`resourceMutations.ts`** – `createResourceMutations` provides the mutation layer (create/update/delete) over the shared `QueryClient`.
- **`recordMutations.ts`** – `canWrite` gate checked before any mutation is allowed.
- **`scopeRegistry.ts`** – `scopeRegistryFor` tracks which scopes are still live; used to avoid one instance wiping another's data and to prune abandoned-scope caches on creation.
- **`queryRemoval.ts`** – `dropQueries` called at resource creation to sweep cached entries under scopes the registry reports as no longer live.
- **`freshnessChecks.ts`** – `createFreshnessChecks` implements stale/fresh logic for active queries.
- **`identifierJoin.ts`** – `joinIdentifiers` handles compound identifier keys.
- **`plainData.ts`** – `isNil` and `stableKey` utilities for key construction and nil checks.
- **`structureRestApi.ts`** – Source of the public option types (`IStructureRestApiOptions`, `IFetchContext`, `IWatchHandle`, etc.) consumed here.
- **`structureDataManagement.ts`** – Provides `useStructureDataManagement` and `TIdOf` for the default identifier type.
- **`structureSearchApi.ts`** – Consumes the `engine` returned by `createRestResource` to build its `'search'` query kind; the engine never reaches application code directly.
- **`package.json`** – Declares runtime dependencies: Vue, `@tanstack/vue-query`, `@guebbit/js-toolkit`.

## Notes

- **`markRaw` on QueryClient** – Pinia wraps a setup store's return in `reactive()`; calling a `QueryClient` method (which uses native `#private` fields) through that proxy throws. The raw marker prevents this.
- **`gcTime: Infinity`** – All three key prefixes (`target`, `parent`, `search`) are set to never garbage-collect while cached. Records leave the cache only via `dependsOn` scope changes, `resetAll`, `maxRecords` enforcement, or explicit deletes.
- **Scope-safety on creation** – Before this instance's scope is claimed in the registry, it is registered; then any cached entry under a scope the registry reports as dead is dropped. A scope another live instance still claims is left untouched.
- **Lazy abort signal** – `IRunningQuery.signal` is a getter. Reading it eagerly would alter how TanStack cancels a fetch when its watcher unmounts.
- **Alias pointers** – A record fetched via an alternate key (e.g. a slug) is stored once under its canonical id; the requested key becomes an `ITargetEntry.aliasOf` pointer. All writes/deletes follow pointers via `resolve`/`refersTo`, so any alias mutation lands on the single canonical record.
- **`maxRecords` enforcement** – Spares records that are on screen, not just those with their own observer: watched list rows (read from cached ids) and records behind a watched alias are collected before the wipe.
- **Effect-scope warning** – If `createRestResource` is called outside an active effect scope, cache subscriptions have no teardown hook and leak for the QueryClient's lifetime. A one-time console warning is emitted per `resourceKey`.
