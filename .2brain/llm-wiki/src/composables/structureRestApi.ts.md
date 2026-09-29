---
source: src/composables/structureRestApi.ts
sha256: 51cae91752a7bcb66f53b90b03a546e1ae4ecf9710dfeb8dbefb84358a82b6a3
generated_at: 2026-09-28T22:31:08.295242+00:00
model: ollama:qwen3.8:27b
---

# src/composables/structureRestApi.ts

## Purpose

Public type contract and the `useStructureRestApi` entry point for a REST resource. It defines all option interfaces, per-call settings, watcher shapes, and the resource handle that consumers see, while delegating all runtime logic to `internal/restResource`. The file exists so the `.d.ts` surface is fully explicit and never references package internals.

## Key elements

- **`IStructureRestApiOptions`** — options accepted by `useStructureRestApi`: `resourceKey` (required), `identifiers`, `delimiter`, `staleTime`, `dependsOn`, `maxRecords`, `queryClient`, `queryOptions`.
- **`IStructureRestApi<T, K, P>`** — the full return type of the composable: `createIdentifier`, `identifierKey`, `resourceKey`, and (truncated) fetch/watch/mutation methods.
- **`IFetchSettings`** — per-call overrides: `forced`, `merge`, `staleTime`, `key`, `partial`.
- **`IUpdateTargetSettings`** — adds `applyResponse` to the `merge`/`key` subset of `IFetchSettings`.
- **`IWatchHandle<R>`** — returned by every `watch*` method: `stop`, `refetch`, `suspense`, `error`.
- **`IWatchCallbacks<R, C>`** — `onSuccess` / `onError` / `onSettled` reported on each settle.
- **`IWatchTargetSettings` / `IWatchListSettings` / `IWatchAnySettings`** — settings for the three watcher families; list/any variants allow reactive `key` and `enabled`.
- **`ITanStackQueryOptions`** — hand-declared narrow pick of TanStack options (`retry`, `retryDelay`, `refetchInterval`, `refetchOnWindowFocus`, `refetchOnReconnect`) that callers may set as resource defaults or per-watcher overrides.
- **`IFetchContext`** — the `{ signal: AbortSignal }` passed as the last arg to every apiCall.
- **`TListCall<T>` / `TMultipleCall<T, K>`** — apiCall signatures for list-shaped and multi-id fetches.

## Relationships

- **`internal/restResource.ts`** — provides `createRestResource`, the actual engine that builds TanStack queries; this file is its public type shell.
- **`composables/structureDataManagement.ts`** — source of the `TIdOf<T>` type used as the default `K` generic.
- **`index.ts`** — re-exports the types and `useStructureRestApi` as the package's public API.
- **`composables/structureCrudApi.ts` / `structureSearchApi.ts`** — sibling composables that build on or alongside this resource (CRUD and search-specific wrappers).
- **`internal/freshnessChecks.ts` / `resourceMutations.ts` / `settleCallbacks.ts` / `tanstackQueryOptions.ts`** — internal modules the `restResource` engine calls; they implement the behaviors described by the types defined here (staleness, optimistic patches, settle reporting, query-option normalisation).
- **`tests/structureRestApi/`** — dedicated test suite exercising the public contract defined in this file.
- **`package.json`** — declares the `@tanstack/vue-query` and `vue` peer/dependencies this file's types reference.

## Notes

- `queryFn`, `queryKey`, and `gcTime` are intentionally **excluded** from `ITanStackQueryOptions`; the engine owns them to preserve its cache-key layout. Callers cannot override them.
- `ITanStackQueryOptions` is hand-declared (not `Pick`'d from TanStack generics) to avoid propagating the `TQueryFnData` generic through every composable signature.
- `IFetchSettings.key` is ignored on record-shaped fetches (a record has exactly one cache entry keyed by id); it only affects list/any shapes.
- `IStructureRestApiOptions.queryClient` is optional; the default comes from `VueQueryPlugin` via `useQueryClient()`. Passing it explicitly is the workaround for Pinia versions < 2.1 or non-Pinia contexts.
- Watchers never reject: failures surface through `error` ref and `onError` callback; `refetch()` always resolves with whatever is cached.
- The `suspense()` method on `IWatchHandle` resolves immediately (possibly with `undefined`) when the watcher is disabled, to avoid hanging SSR.
