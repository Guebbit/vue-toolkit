---
source: tests/structureRestApi/unit/failedRefetch.spec.ts
sha256: 2c439847b442c71f48e13ff132b038e5cd3b21d11382b3c1670cdb1bdfd972d4
generated_at: 2026-09-28T23:01:21.678287+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/failedRefetch.spec.ts

## Purpose

Unit tests that verify the composable's cache-preservation semantics on failed network requests: a refetch that fails must keep the previously cached record/list intact, while a first-fetch failure that produced no data is cleaned up (unless an active watcher is observing the error).

## Key elements

- **`describe('UNIT · failed refetches')`** — the sole test suite; six `it` blocks covering:
    - Failed `fetchTarget` refetch → cached record survives.
    - Failed first `fetchTarget` → no query entry created.
    - Failed `fetchAll` refetch → cached list survives.
    - Failed `fetchAll` while a `watchAll` handle is active → handle's `.error` reflects the new failure.
    - Failed `fetchTarget` while a `watchTarget` handle is active → same error-propagation guarantee.
    - Failed keyed `fetchAny` → no empty entry left behind, so the _next_ `fetchAny` call actually re-executes the query.
- **`afterEach(clearAllInstances)`** — global teardown between tests.

## Relationships

- **`../_helpers/harness`** — provides `makeComposable` (instantiates the composable under test), `clearAllInstances`, and `flush` (microtask pump for reactive settles).
- **`../_helpers/fakeApi`** — provides `apiReject` / `apiResolve`, which return `Promise`-rejecting/resolving stubs used as the "API call" argument.
- **`../_helpers/fixtures`** — provides `USERS` (array of three `IUser` objects) and the `IUser` type used as the generic parameter.
- **`vue`** — `ref` is used directly in the `watchTarget` test to create a reactive id source.

## Notes

- The core invariant under test: **a record is its query key**. Removing the query entry after a failed refetch would silently drop the record from every view over a transient network blip.
- The one exception is an _active watcher_: an empty query entry that a `watchAll`/`watchTarget` handle is subscribed to must persist so the watcher can surface the error instead of appearing as "pending with nothing in flight."
- The keyed `fetchAny` test asserts a _negative_ cache policy: a failed first fetch leaves no entry, guaranteeing the retry path re-invokes the query (verified via `toHaveBeenCalledTimes(1)` on the resolving stub).
- Tests use `{ forced: true }` on refetch calls to bypass any "already have data" short-circuit, ensuring the failing request is actually attempted.
