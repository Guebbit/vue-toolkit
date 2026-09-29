---
source: tests/structureRestApi/lifecycle/watchedRemoval.spec.ts
sha256: 6c54c09190d9b89dfb5f2506ce5e38c6e7b0c00a1393724a5607edf8e8863f20
generated_at: 2026-09-28T22:55:02.747504+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/lifecycle/watchedRemoval.spec.ts

## Purpose

Verifies that removing or resetting watched queries never strands their watcher. Because TanStack Query does not notify an observer when its query leaves the cache, the composable resets queries in place rather than deleting them. These tests confirm that `resetAll`, `resetRecords`, and a failed `deleteTarget` all preserve the watcher attachment so subsequent invalidation or refetch still fires.

## Key elements

- **`describe('LIFECYCLE · dropping watched queries')`** — suite containing three focused tests.
- **Test 1 — `resetAll() refetches what an active watchAll shows`** — calls `watchAll` then `resetAll`; asserts the API was called twice and the item list is populated.
- **Test 2 — `after resetRecords(), invalidation still reaches an active watchTarget`** — calls `watchTarget`, then `resetRecords()` (record is gone), then invalidates via `queryClient`; asserts the watcher still refetches and the record is restored.
- **Test 3 — failed `deleteTarget` leaves watcher attached** — sets up `watchTarget`, triggers a `deleteTarget` that rejects (409); asserts the rollback invalidation causes the watcher to refetch the record autonomously.
- **`afterEach(clearAllInstances)`** — tears down all composable instances between tests.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** — supplies `makeComposable<T>` (builds a composable instance), `clearAllInstances` (global cleanup), and `flush` (advances microtask/promise queue).
- **`tests/structureRestApi/_helpers/fixtures.ts`** — supplies the `USERS` array and the `IUser` interface used as the generic data type throughout.
- **`package.json`** — declares the test runner (Jest) and the `vue` dependency used for `ref`.

## Notes

- The file header comment documents the _why_: TanStack Query silently detaches observers when a query is evicted, so the composable's strategy is "reset in place" rather than "remove and re-create." All three tests are regression guards for that design decision.
- Test 3 is the subtlest: the watcher refetch is _not_ triggered by an explicit `invalidateQueries` call but by the rollback path inside a failed `deleteTarget`. It proves the watcher is still subscribed at the TanStack level.
- Query key used in Test 2's manual invalidation is `['resource']` — this is the key the composable's `watchTarget` registers under; keep in sync if the key scheme changes.
