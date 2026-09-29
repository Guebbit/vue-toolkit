---
source: src/internal/recordMutations.ts
sha256: 87590977cc32efb0f68cb0f69b28b3830b80f3f6adf6e5d3f1c4d79ac1fd9d1e
generated_at: 2026-09-28T22:35:03.648294+00:00
model: ollama:qwen3.8:27b
---

# src/internal/recordMutations.ts

## Purpose

Answers "is record `id` currently being changed?" by reading TanStack Query's `MutationCache` directly, so a read and a mutation always agree on the same source of truth (one cache per `QueryClient`). It also provides an ordering check ("did this mutation start before this read?") using a high-resolution timestamp the mutation carries in its own `meta`, rather than TanStack's coarser `submittedAt`.

## Key elements

- **`IRecordMutationMeta`** – Shape of the `meta` object every `update`/`delete` mutation must attach. Contains `scope` (the `dependsOn` snapshot the mutation started under) and `startedAt` (`performance.now()` at mutation start).
- **`recordMutationsOf(queryClient, resourceKey, id)`** – Queries the mutation cache for all pending-or-finished mutations whose key is `[resourceKey, 'update'|'delete', String(id)]`. Returns `Mutation[]`.
- **`canWrite(queryClient, resourceKey, id, scope, readStartedAt)`** – Returns `true` only if **no** mutation for that record, in the same scope (compared via `stableKey`), is still `pending` **and** none started at or after `readStartedAt`. A finished mutation that began before the read does not block the write.

## Relationships

- **`src/internal/plainData.ts`** — imports `stableKey` to canonicalise `scope` arrays for comparison in `canWrite`.
- **`src/internal/resourceMutations.ts`** — builds the mutation key layout (`[resourceKey, 'update'|'delete', String(id)]`) that `recordMutationsOf` expects to match; also attaches the `IRecordMutationMeta` payload this file reads.
- **`src/internal/resourceActivity.ts`** / **`src/internal/restResource.ts`** — upstream consumers that call `canWrite` (and/or import `IRecordMutationMeta`) to gate a write against in-flight mutations.
- **`tests/internal/recordMutations.spec.ts`** — unit tests for the three exports.
- **`tests/package/smoke.mjs`** — end-to-end smoke test that exercises the write-gating path.

## Notes

- **`startedAt` ≠ `submittedAt`.** TanStack's own `submittedAt` uses `Date.now()` (millisecond resolution); two operations in the same synchronous stretch can share a millisecond, making a `<` comparison unreliable. `performance.now()` is monotonic and sub-millisecond, so distinct captures never collide.
- **No cache pruning needed.** Finished mutations are left to TanStack's `gcTime`; `canWrite` simply skips them via the `status !== 'pending'` guard.
- **`id` is always stringified.** Both the key match in `recordMutationsOf` and the key layout in `resourceMutations.ts` use `String(id)`, so numeric and string ids for the same record are equivalent.
