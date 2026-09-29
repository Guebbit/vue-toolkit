---
source: src/internal/resourceMutations.ts
sha256: d103d7c93a1ebf57c860a0b1999d52db9129045cf12a60cdd511c5a8a11ce85f
generated_at: 2026-09-28T22:36:27.858231+00:00
model: ollama:qwen3.8:27b
---

# src/internal/resourceMutations.ts

## Purpose

Implements the write side (optimistic create / update / delete plus free-form commands) for a single resource. Each write runs as a one-shot TanStack `MutationObserver` so `isLoading` can track it, and update/delete share a single optimistic protocol built on TanStack's `onMutate` / `onSuccess` / `onError` / `onSettled` lifecycle.

## Key elements

- **`IRecordOperations<T, K>`** — Interface for the four record operations a mutation writes through: `createIdentifier`, `editRecord`, `deleteRecord`, `markInserted`.
- **`IResourceMutationsContext<T, K>`** — The dependency bag a resource must supply: `queryClient`, `resourceKey`, `keys`, `dependsOn`, `records`, `store`, `storeServerRecord`, `scopeRegistry`.
- **`createResourceMutations(context)`** — The sole export. Returns `mutateAny`, `createTarget`, `updateTarget`, `deleteTarget`.
- **`runMutation`** (internal) — Wraps an `apiCall` in a `MutationObserver`, attaches the caller's key as `meta.key` (what `isLoading(key)` matches), and calls `observer.reset()` in `finally` so the mutation can be GC'd after `gcTime`.
- **`invalidateLists` / `invalidateRecord`** (internal) — Mark scope-level list queries or a single record (plus every alias pointer to it) stale; `invalidateRecord` uses `refetchType: 'active'`.
- **`cancelReads`** (internal) — Cancels the in-flight read for a specific record id and its aliases. Scope-level list reads are deliberately left running.
- **`rollback`** (internal) — Restores the pre-change snapshot only if the store still holds exactly what _this_ call wrote; otherwise (a newer mutation owns the record) it leaves the record alone.
- **`IOptimisticContext`** (internal interface) — The `{ previous, written }` pair returned from `onMutate` and consumed by `onSuccess` / `onError` to decide whether to store the server result or roll back.

## Relationships

- **`src/internal/queryRecordStore.ts`** — All local reads, snapshots, restores, and server-result stores go through the `IQueryRecordStore` instance passed in the context (`store.read`, `store.restore`, `store.forScope`).
- **`src/internal/resourceKeys.ts`** — `IResourceKeys` provides the key layout and scope predicates (`keys.inScope`, `keys.refersTo`) used by every invalidation and cancellation call. `LIST_KINDS` scopes list-level invalidation.
- **`src/internal/scopeRegistry.ts`** — `scopeRegistry.isLive(scope)` gates every local write: once no live instance claims the scope the mutation is skipped.
- **`src/internal/recordMutations.ts`** — Its `canWrite` mechanism (asked of TanStack's `MutationCache`) prevents a concurrent list read from overwriting the record id that a pending mutation owns. `IRecordMutationMeta` is imported as a type.
- **`src/composables/structureRestApi.ts`** — Source of the `IFetchSettings` and `IUpdateTargetSettings` types used in the `storeServerRecord` signature.
- **`src/internal/restResource.ts`** — `storeServerRecord` follows the same alias rule (store under the server's own id, point the requested id at it when different) that restResource's reads implement. The scope-liveness rule also references restResource's convention.
- **`src/internal/plainData.ts`** — Provides `isNil` used in internal checks.
- **`package.json`** — Supplies the runtime dependencies: `@tanstack/vue-query` (`MutationObserver`, `QueryClient`), `@guebbit/js-toolkit` (`getUuid`), `vue` (`toRaw`).

## Notes

- **Rollback guard:** `rollback` compares the current store value against `written` (what _this_ call applied). A failed older mutation will never undo a newer one that already owns the record.
- **Snapshot timing:** The pre-change snapshot is taken _inside_ `onMutate`, not at call dispatch. This means a same-tick sibling mutation on the same id rolls back to what the first call left behind, not to a shared "before either" value.
- **List reads are never cancelled** — only the individual record read and its alias pointers. The record's in-flight list read is left to complete; `canWrite` in `recordMutations.ts` prevents it from overwriting the mutated id.
- **Observer lifecycle:** `observer.reset()` is called in `finally` after the mutation settles. This detaches the observer so the mutation can leave the cache on its own `gcTime`, but it must remain long enough for a read that started before or during the mutation to still find it.
- **Alias resolution:** `updateTarget` / `deleteTarget` resolve a slug/alias to the real record id _before_ entering the optimistic protocol, so the mutation key and all invalidation/cancellation predicates address the same record an equivalent real-id call would.
- **`markInserted`** is called explicitly by `createTarget` rather than relying on `editRecord`'s side-effect, because `createTarget` wraps the write in `asFetched` for its own reason (the response is server-confirmed data), which would suppress that side-effect.
- **Scope capture:** Every local write executes under the `dependsOn` snapshot the call _started_ with (`store.forScope`), so a concurrent scope change mid-flight does not alter what the write sees or writes to.
