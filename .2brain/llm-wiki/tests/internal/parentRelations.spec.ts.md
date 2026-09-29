---
source: tests/internal/parentRelations.spec.ts
sha256: 0d820c459a997c661fa79e251b775897d25baf531aeb3efec344db50495a50db
generated_at: 2026-09-28T22:40:46.052085+00:00
model: ollama:qwen3.8:27b
---

# tests/internal/parentRelations.spec.ts

## Purpose

Unit tests for `createQueryRelationStore` that verify the relation store is a scoped view over parent-list cache entries. They pin down which buckets a mutation touches (per-parent, per-scope) and that linking a child is idempotent regardless of whether the child already exists in any bucket or is linked to a different parent.

## Key elements

- **`build()`** – Factory that wires a fresh `QueryClient`, a reactive `scope` ref, a `version` ref, resource keys (via `createResourceKeys('items', …)`), and the relation store. Also returns `seed` and `read` helpers that write/read `IListCacheEntry<number>` buckets directly through the query cache.
- **`seed(parentId, ids, bucket?, atScope?)`** – Writes a bucket exactly as `fetchByParent` would, then bumps `version` to signal a cache update.
- **`read(parentId, bucket?, atScope?)`** – Returns the `ids` array currently stored in a bucket (or `undefined`).
- **`describe('UNIT · createQueryRelationStore', …)`** – Test suite covering:
    - `dictionary` merges all buckets of a parent and keeps separate parents apart.
    - `removeFromParent` edits every bucket of that parent within the current scope only.
    - `removeFromParent` does not touch entries in a different scope.
    - `removeDuplicateChildren` dedupes the target parent's buckets and leaves other parents untouched.
    - `addToParent` creates a new child in the plain (empty-bucket) entry and marks it stale (`dataUpdatedAt === 0`).
    - `addToParent` is a no-op when the child is already linked in _any_ bucket of the same parent (no plain entry is created).
    - `addToParent` does not duplicate a child already in the plain entry (entry not re-stamped as stale).
    - `addToParent` still links a child that is currently linked to a _different_ parent.

## Relationships

- **`src/internal/parentRelations.ts`** – The module under test; provides `createQueryRelationStore` (the store whose `dictionary`, `removeFromParent`, `removeDuplicateChildren`, and `addToParent` are exercised here).
- **`src/internal/resourceKeys.ts`** – Supplies `createResourceKeys` (key derivation for parent/scope/bucket) and the `IListCacheEntry<T>` type used to type-cache reads and writes.
- **`package.json`** – Declares the runtime/test dependencies consumed here: `vue` (for `ref`), `@tanstack/vue-query` (for `QueryClient`), and the test runner.

## Notes

- "Plain entry" refers to the bucket with an empty bucket array (`[]`); it is the canonical bucket `addToParent` writes into.
- A `dataUpdatedAt` of `0` is the convention for "stale / needs refetch" in this codebase; the tests assert it to confirm `addToParent` marks the entry accordingly.
- `scope` is a reactive ref passed as `dependsOn`, so the store is expected to re-derive its dictionary when the scope changes; tests scope entries by passing `atScope` explicitly to `seed`/`read`.
- The `version` ref is bumped after every `seed` call to simulate a cache version change, which is how the store detects new data.
