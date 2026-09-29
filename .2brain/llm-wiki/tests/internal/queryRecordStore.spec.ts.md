---
source: tests/internal/queryRecordStore.spec.ts
sha256: 2d731c49847530a496ebe639065cdcacf93be7c8dcefd592e62a1eea75f47d7e
generated_at: 2026-09-28T22:41:23.389538+00:00
model: ollama:qwen3.8:27b
---

# tests/internal/queryRecordStore.spec.ts

## Purpose

Unit tests for the freshness bookkeeping of `queryRecordStore`. They verify that `asFetched` correctly restores its "fetched" flag (even on throw), that `clear`/`writeAll` have distinct refetch semantics, and that the `snapshot`/`restore` pair preserves a record's original `dataUpdatedAt` stamp and `isInvalidated` flag rather than resetting them to "now" / "valid".

## Key elements

- **`makeStore()`** – Factory that wires together a fresh `QueryClient`, a `createResourceKeys` instance, and a `createQueryRecordStore<IItem, number>`. The client is registered in a module-level `clients` array and cleared in `afterEach`.
- **`watchList(queryClient, keys)`** – Creates a `QueryObserver` on the `'all'` list entry with `staleTime: Infinity` and a counting `queryFn`. Returns `{ counter, unsubscribe }` so tests can assert fetch counts.
- **`describe('asFetched')`** – Asserts that `store.asFetched(fn)` re-throws `fn`'s error _and_ leaves the fetched flag unset, so a subsequent `store.write` keeps `dataUpdatedAt` at `0` (stale) rather than being stamped "now".
- **`describe('clear / writeAll')`** – `clear()` triggers a refetch of an active list watcher (fetch count 1 → 2); `writeAll()` sets `isInvalidated` to `true` on the list but does **not** trigger a refetch (count stays 1).
- **`describe('snapshot')`** – Returns `undefined` for null or absent records; otherwise returns `{ item, updatedAt, isInvalidated }`.
- **`describe('restore')`** – Restores a record with its original `dataUpdatedAt` (not "now") and its original `isInvalidated` flag (preserving both `true` and `false` cases).
- **`IItem`** – Minimal `{ id: number; name: string }` shape used as the record type parameter.

## Relationships

- **`src/internal/queryRecordStore.ts`** – Module under test; provides `createQueryRecordStore` and the store API (`asFetched`, `write`, `clear`, `writeAll`, `snapshot`, `restore`).
- **`src/internal/resourceKeys.ts`** – Provides `createResourceKeys('resource', …)` which builds the key layout (`keys.target`, `keys.entry`) used both by the store and by direct `queryClient.setQueryData` / `getQueryState` calls.
- **`tests/structureRestApi/_helpers/harness.ts`** – Supplies `newTestClient()` (configures a `QueryClient` for tests) and `flush()` (advances microtask/macro-tick queues so async query transitions settle).
- **`package.json`** – Declares the `vue` and `@tanstack/vue-query` dependencies consumed here.

## Notes

- The `asFetched` throw test is the most subtle case: it guards against a regression where a failed fetch would incorrectly stamp a _later_ local write as fresh, defeating the store's freshness distinction between server-confirmed and locally-guessed data.
- `watchList` uses `staleTime: Infinity` so the observer does not auto-refetch between assertions; the only refetches counted are the ones triggered by `store.clear()`.
- The `version: ref(0)` parameter is a Vue reactive ref required by the store's constructor; tests never mutate it.
- `afterEach` calls `client.clear()` on every registered client to isolate tests; forgetting to register a client in `makeStore` would leak query state into the next test.
