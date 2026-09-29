---
source: tests/structureRestApi/intention/crud-lifecycle.spec.ts
sha256: aa0c5e0daf6bc2062a86f4d7b8c8d5bc41bdfa46d7a1db7867bd390d153a860a
generated_at: 2026-09-28T22:49:30.199889+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/intention/crud-lifecycle.spec.ts

## Purpose

End-to-end test that exercises the full entity lifecycle (list → detail → update → create → delete → verify-gone) against a stateful fake REST server. It asserts **both** the local store state and the exact number of server round-trips at each step, verifying that the cache layer eliminates redundant GETs. A second branch covers optimistic rollback when the server rejects an update or delete.

## Key elements

- **`describe('INTENTION · CRUD lifecycle')`** — top-level suite; all three tests live here.
- **Test 1: "walks list → detail → update → create → delete with minimal server hits"** — the main happy-path walkthrough. Calls `fetchAll`, `fetchTarget`, `updateTarget`, `createTarget`, `deleteTarget` in sequence, asserting `server.calls.*` counts and local store contents after each step. Includes a re-open-after-update check (cache hit) and a post-delete fetch (cache miss → server hit returning `undefined`).
- **Test 2: "rolls an optimistic update back when the server rejects"** — calls `updateTarget` with `apiReject()`; expects the promise to throw and the record to be unchanged.
- **Test 3: "rolls an optimistic delete back when the server rejects"** — same pattern for `deleteTarget` + `apiReject()`.
- **`afterEach(clearAllInstances)`** — tears down composable instances between tests.

## Relationships

- **`../_helpers/harness.ts`** — supplies `makeComposable<IUser, number>` (the SUT factory) and `clearAllInstances` (cleanup).
- **`../_helpers/fakeServer.ts`** — supplies `createServer<IUser>(…)`, a stateful in-memory REST server that tracks per-endpoint call counts (`server.calls.list`, `.get`, `.update`, `.create`, `.remove`).
- **`../_helpers/fakeApi.ts`** — supplies `apiReject()`, a promise that rejects, used to simulate server-side 500s for the rollback tests.
- **`../_helpers/fixtures.ts`** — supplies `buildUsers(3, 1)` to seed the fake server and the `IUser` type parameter for generics.

## Notes

- The "INTENTION" label is the feature/domain name for this composable pattern; it is not a library or framework.
- Cache semantics are the core assertion: after `fetchAll`, `fetchTarget` for a seeded id must produce **zero** `GET` calls; after `updateTarget`, the cache is reseeded (another zero-`GET` open); after `deleteTarget`, the cache entry is invalidated so the next `fetchTarget` **does** hit the server once.
- `buildUsers(3, 1)` seeds 3 users starting at id 1, so the "create" test produces id 4 and the "delete" targets id 4.
- The rollback tests capture a `before` snapshot with `c.getRecord(n)` and assert deep-equality after the rejected call, confirming the optimistic write was undone.
