---
source: tests/structureRestApi/intention/list-invalidation.spec.ts
sha256: 99f3c5d3e68ec30af627178353b25aca9b1c3ef3fe45a3801b482e084ff3c3bf
generated_at: 2026-09-28T22:50:31.566391+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/intention/list-invalidation.spec.ts

## Purpose

Pins the invalidation predicate for list-shaped cache entries: a `createTarget`, `updateTarget`, or `deleteTarget` must mark all / paginate / parent caches stale so the next fetch re-hits the server, while non-list caches (e.g. `fetchAny`) remain fresh. Search-query invalidation is intentionally out of scope (covered in `tests/structureSearchApi/intention/mutation-invalidation.spec.ts`).

## Key elements

- **`describe('INTENTION · list invalidation on create/update/delete')`** — top-level suite; `afterEach(clearAllInstances)` resets composable state between tests.
- **`createTarget invalidates all / paginate / parent caches → each refetches once`** — primes `fetchAll`, `fetchPaginate`, and `fetchByParent`, then calls `createTarget`; asserts each kind refetched exactly once by checking `server.calls.list` / `server.calls.search` counters.
- **`deleteTarget invalidates the same list-shaped caches`** — same pattern with `remove` (delete).
- **`updateTarget invalidates the same list-shaped caches`** — same pattern with `update`; also asserts staleness via `c.checkAll()` / `c.checkByParent(7)`.
- **`a FAILED updateTarget marks lists stale`** — a rejected mutation (`409`) still invalidates list caches because it cancelled their in-flight reads.
- **`leaves UNRELATED caches fresh`** — verifies `fetchAny` is _not_ touched by a `createTarget`, confirming the predicate does not over-invalidate.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** — provides `makeComposable` (the system under test) and `clearAllInstances` (teardown).
- **`tests/structureRestApi/_helpers/fakeServer.ts`** — provides `createServer<IUser>`, a mock that exposes callable methods (`list`, `search`, `create`, `update`, `remove`) and `calls` counters used for refetch assertions.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — provides `buildUsers(n, startId)` and the `IUser` type used to seed the fake server.

## Notes

- Scope is deliberately narrow: the file header comment explicitly defers _search_ invalidation to the `structureSearchApi` suite. If you're hunting search invalidation behavior, go there instead.
- The failed-mutation test (`409`) documents a non-obvious invariant: even when the server rejects the write, the client-side list caches are still marked stale. This is because the mutation path cancels any in-flight list reads it started, so those reads must be retried.
- Assertions rely on exact call-count equality (`toBe`, not `toBeGreaterThanOrEqual`), so an extra or missing refetch will fail the test.
