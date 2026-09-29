---
source: src/internal/parentRelations.ts
sha256: 81466319b82ffad060ebf962d693d85667c88757a25a16ec3d26987166670ce1
generated_at: 2026-09-28T22:33:18.411086+00:00
model: ollama:qwen3.8:27b
---

# src/internal/parentRelations.ts

## Purpose

Implements `belongsTo` (parent → children) relations as a reactive view over a TanStack Query cache. It provides the `IRelationStore` implementation that `useStructureDataManagement` consumes, so UI code can read a merged child list and perform local link/unlink edits without a separate in-memory copy to keep in sync.

## Key elements

- **`IParentRelationsContext`** (exported interface) — the four pieces the owning resource must supply: `queryClient`, `keys` (resource key layout + scope predicates), `dependsOn()` (current scope snapshot), and `version` (a `Ref<number>` that bumps on cache mutations to invalidate the computed).
- **`createQueryRelationStore<K, P>(context)`** (exported factory) — returns an `IRelationStore<P, K>` with:
    - `dictionary` — `ComputedRef<Record<P, K[]>>`: the merged child-id list per parent, built by unioning all cached buckets under the current scope and de-duplicating with `uniqueIds`.
    - `addToParent(parentId, childId)` — appends a child id to the parent's **plain (keyless)** entry only; no-ops if the id is already present (checked via `sameId`).
    - `removeFromParent(parentId, childId)` — removes the id from **every** bucket of that parent.
    - `removeDuplicateChildren(parentId)` — de-duplicates ids in every bucket of that parent.
- **Internal helpers** (not exported): `idsOf` (extracts `ids` from a query's cached data), `bucketsOf` (finds all parent-list queries for one parent under the current scope), `writeIds` (writes a new `IListCacheEntry` via `setQueryData` with `updatedAt: 0`).

## Relationships

- **`src/composables/structureDataManagement.ts`** — defines the `IRelationStore` interface that `createQueryRelationStore` satisfies; also the caller that constructs this store and exposes it to components.
- **`src/internal/idEquality.ts`** — supplies `sameId` (identity comparison used for membership checks and filtering) and `uniqueIds` (order-preserving de-duplication used in the dictionary merge and `removeDuplicateChildren`).
- **`src/internal/resourceKeys.ts`** — supplies the `IResourceKeys` type (key construction + `inScope` predicate) and the `IListCacheEntry` shape that every cached parent list uses.
- **`package.json`** — declares the runtime dependencies this file imports: `vue` (`computed`, `Ref`) and `@tanstack/vue-query` (`QueryClient`, `Query`, `QueryKey`).
- **`tests/internal/parentRelations.spec.ts`** — unit tests exercising the store's read/write behaviour.

## Notes

- **Asymmetric write strategy.** `addToParent` writes only to the keyless (plain) entry, while `removeFromParent` and `removeDuplicateChildren` rewrite _every_ bucket for that parent. The merged `dictionary` view stays consistent because it unions all buckets, but the underlying cache entries are not uniform after mixed operations.
- **`updatedAt: 0` = stale.** Every local edit sets `updatedAt` to `0`, signalling TanStack Query that the data is a local guess; the next `fetchByParent` call will overwrite it with server truth.
- **Reactivity via `version`.** The `dictionary` computed reads `void version.value` to register a dependency on the owning resource's version ref. Without this, cache mutations that don't change the query object reference would not trigger a recompute.
- **Id comparison is `sameId`, not `===`.** The project treats ids as opaque values compared through `sameId` (see `idEquality.ts`); using raw `===` for membership checks would be incorrect.
