---
source: src/internal/queryRecordStore.ts
sha256: be5f4cc8f8350c0fde4d897af7258a6c313909272a796b036f7f9bd249a46b55
generated_at: 2026-09-28T22:34:17.409912+00:00
model: ollama:qwen3.8:27b
---

# src/internal/queryRecordStore.ts

## Purpose

Implements the `IRecordStore` seam backed by TanStack Vue Query: one query per record, one scope per resource. Provides O(1) read/write/remove/snapshot/restore operations, alias resolution, and a freshness model where only writes made inside `asFetched` (server answers) are stamped fresh—every other write is treated as a local guess that inherits the previous stamp (or `0` for new records).

## Key elements

- **`createQueryRecordStore`** – Factory that takes `IQueryRecordStoreContext` (queryClient, keys, dependsOn, version) and returns an `IQueryRecordStore<T, K>`.
- **`dictionary`** (computed, exported on the store) – Read-only view of every record in the current `dependsOn` scope, rebuilt reactively when `version` bumps. Returns `null` for absent records.
- **`asFetched(run)`** – Runs `run` with writes counted as server answers (stamped `Date.now()`). Reentrant-safe (saves/restores the outer `fetched` flag).
- **`forScope(scope, run)`** – Temporarily overrides which scope all key-building calls (`write`, `read`, `remove`, `snapshot`, `restore`, `resolve`) address. Used by `restResource` to route a late answer back to the scope it was fetched under.
- **`resolve(id)`** – One-hop alias resolution: if the entry at `id`'s key holds `aliasOf`, returns that; otherwise returns `id` unchanged. Reads the raw key directly (never through `keyOf`) to avoid circularity.
- **`keyOf(id)`** – Internal: `keys.target(resolve(id), currentScope())`. Every read/write in the store goes through this so aliases and real ids hit the same cache entry.
- **`read(id)`** – O(1) lookup straight off the query cache (bypasses `dictionary`).
- **`write(id, item)`** – Sets the query data; preserves `dataUpdatedAt` unless inside `asFetched`; re-invalidates if the record was previously invalidated and the write is a local guess.
- **`remove(id)`** – Drops the record **and** all alias pointers referencing it (via `keys.refersTo` + `dropQueries`), so a lingering alias can't keep serving "nothing" as fresh.
- **`dropAll(refetch)` / `clear()`** – Removes every record in scope; marks scope lists stale so their next read hits the server. `clear` is `dropAll(true)`.
- **`writeAll(items)`** – `dropAll(false)` then writes each entry; none of the writes count as fetched.
- **`snapshot(id)` / `restore(id, saved)`** – Capture and later replay a record's exact state (item + `dataUpdatedAt` + `isInvalidated`) for undo/optimistic-rollback.
- **`IRecordSnapshot<T>`** – The shape returned by `snapshot`: `{ item, updatedAt, isInvalidated }`.
- **`isFetching()`** – Exposes whether `asFetched` is currently active (mirrors `IRecordStore.isFetching`).

## Relationships

- **`src/composables/structureDataManagement.ts`** – Defines the `IRecordStore` interface that this module implements; the composable writes through this store's seam methods.
- **`src/internal/resourceKeys.ts`** – Supplies `IResourceKeys` (key builders, `inScope`, `refersTo`), `ITargetEntry`, and `LIST_KINDS`; the store delegates all key construction and scope-predicate logic to it.
- **`src/internal/queryRemoval.ts`** – Provides `dropQueries`, used by `remove` and `dropAll` to clear cached queries (emptying watchers in place rather than removing them).
- **`src/internal/plainData.ts`** – Provides `isNil`, used to distinguish "no record" (`null`/`undefined`) from a valid falsy value in `dictionary` and `snapshot`.
- **`src/internal/restResource.ts`** – The REST layer that calls `asFetched` and `forScope` on this store; its module header documents the scope rule that `forScope` enforces.
- **`tests/internal/queryRecordStore.spec.ts`** – Unit tests for the store's read/write/remove/snapshot/restore/alias/scope behavior.

## Notes

- `dictionary` is wrapped with `readonly()` on the _object_ it returns, not on the `ComputedRef` itself—this keeps Pinia able to unwrap it reactively.
- `resolve` deliberately reads the raw key via `queryClient.getQueryData(keys.target(id, …))` rather than calling `keyOf(id)`, because `keyOf` calls `resolve`—using it inside `resolve` would be circular.
- `write` preserves the prior `dataUpdatedAt` for local (non-fetched) writes; a new record with no prior state gets `0`, which TanStack reads as "stale." This is intentional: optimistic edits must not masquerade as server-confirmed data.
- `remove` resolves the id first, then drops `keys.refersTo(realId, scope)`—this catches alias entries that point _at_ the record but live under a different key. Forgetting this would leave a fresh alias entry that keeps answering "no record" for its own key.
- `dropAll(false)` (used by `writeAll`) avoids refetching lists, because a refetch would overwrite the records that were just written.
- The `fetched` and `scopeOverride` flags are simple mutable lets, not refs; they exist only for the duration of a synchronous `asFetched`/`forScope` call and are restored in a `finally`.
