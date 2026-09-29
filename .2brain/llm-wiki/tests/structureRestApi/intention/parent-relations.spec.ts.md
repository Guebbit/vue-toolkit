---
source: tests/structureRestApi/intention/parent-relations.spec.ts
sha256: 1280d744e7d6517454de889c8a7cc3d7df6a97f9ec17395c357ac116e0513877
generated_at: 2026-09-28T22:50:48.493278+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/intention/parent-relations.spec.ts

## Purpose

Integration tests for the INTENTION layer's `belongsTo`/`hasMany` parent-relation API. Verifies that children fetched per parent are tracked in isolation, de-duplicated on refetch, unlinkable/movable without mutating the underlying records, and that server-specified child order is preserved.

## Key elements

- **`make()`** — factory wrapping `makeComposable<IUser, number>()`; returns a fresh composable instance for each test.
- **`afterEach(clearAllInstances)`** — tears down all composable instances after every test.
- **`describe('INTENTION · parent relations')`** — core behaviours:
    - Separate child lists per parent key.
    - De-duplication on forced refetch of the same parent.
    - `removeFromParent` unlinks a child while `getRecord` still resolves it.
    - `getRecordsByParent` returns an id-keyed dictionary (vs. `getListByParent` which returns an array).
    - Move a child between parents via `removeFromParent` + `addToParent`.
    - `addToParent` is idempotent for already-linked children.
    - `removeDuplicateChildren` cleans both the reactive `parentHasMany` value _and_ the underlying query-cache entry.
    - `getRecordsByParent(undefined)` / `getListByParent()` return empty collections, not an error.
- **`describe('INTENTION · a parent fetched into several buckets')`** — same parent fetched under two different `key` arrays; union is shown, and `removeFromParent` removes the child from all buckets at once.
- **`describe('INTENTION · relation order')`** — `getListByParent` preserves the order the server listed children (not insertion or id order).

## Relationships

- **`_helpers/harness.ts`** — supplies `makeComposable` (instantiates the composable under test) and `clearAllInstances` (per-test cleanup).
- **`_helpers/fakeApi.ts`** — supplies `apiResolve`, which wraps a plain array into a resolved fake-API shape consumable by `fetchByParent`.
- **`_helpers/fixtures.ts`** — supplies `buildUsers` (generates N fake `IUser` objects with sequential ids) and the `IUser` type used for the composable's generic.

## Notes

- The `removeDuplicateChildren` test is the only one that reaches into the query client directly (`queryClient.setQueryData` / `getQueryData`) to inject and verify cache-level deduplication; all other tests interact solely through the composable's public API.
- "Buckets" refers to the optional `key` array passed to `fetchByParent`; multiple fetches of the same parent under different keys are merged into one `parentHasMany` entry, and a single `removeFromParent` call removes the child from every bucket simultaneously.
- Order is asserted as an exact array equality (`[3, 1, 2]`), meaning the layer must not sort or re-order children.
