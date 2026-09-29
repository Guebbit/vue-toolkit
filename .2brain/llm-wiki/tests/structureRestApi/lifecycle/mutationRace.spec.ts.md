---
source: tests/structureRestApi/lifecycle/mutationRace.spec.ts
sha256: 8a2491c586d065c0ec14f9d8c98a52762ae1039bad8b1cb919d4f51bebcb9f62
generated_at: 2026-09-28T22:53:49.917878+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/lifecycle/mutationRace.spec.ts

## Purpose

Verifies that in-flight mutations (`updateTarget`, `deleteTarget`) never corrupt the state produced by concurrent reads (`fetchAll`, `fetchTarget`, `fetchMultiple`) and vice-versa. Covers the full matrix of races: a mutation racing a scope-wide read, a by-id read racing the same record's mutation, cross-instance visibility via a shared `QueryClient`, and two same-tick mutations on one id (including rollback-to-snapshot and newer-mutation-wins ordering).

## Key elements

- **`describe('… racing a read of the same scope')`** — asserts that `updateTarget`/`deleteTarget` cancel only the mutated id's read, not the whole scope; the stale copy of the mutated id is discarded while other ids in the same list are stored.
- **`describe('… a by-id read of the record a mutation is changing')`** — confirms a `fetchTarget` (or `watchTarget().refetch()`) started _after_ a mutation begins is blocked solely by the `canWrite` guard, not by cancellation; the optimistic value survives until the mutation settles.
- **`describe('… two instances of one resource on one client')`** — proves one `MutationCache` per `QueryClient` means a mutation in instance `a` protects instance `b`'s in-flight `fetchAll`.
- **`describe('… two same-tick mutations on the same id')`** — locks in the snapshot-at-apply-time fix: a sibling's failure rolls back to _this_ call's pre-apply state, never to the state before either call ran; `checkTarget` returns `false` so the next read reconciles.
- **`describe('… a newer mutation on the same id wins')`** — an older mutation's success is discarded in favor of the newer optimistic value and triggers a `refetchType: 'active'` invalidation; an older mutation's failure skips rollback entirely and does _not_ invalidate.
- **`watchInvalidations(c)`** — local helper that spies on `queryClient.invalidateQueries` and partitions calls into record-level (`refetchType: 'active'`) vs. list-level invalidations.

## Relationships

- **`tests/structureRestApi/_helpers/fakeApi.ts`** — supplies `deferredApi`, `apiResolve`, `apiReject` for controllable promise-based mock API calls.
- **`tests/structureRestApi/_helpers/harness.ts`** — supplies `makeComposable`, `makeShared`, `clearAllInstances`, `flush` (used in every test for setup/teardown and microtask draining).
- **`tests/structureRestApi/_helpers/fixtures.ts`** — supplies the `USERS` array and the `IUser` interface used as the domain type throughout.
- **`package.json`** — project root; the test runs under Jest (evidenced by `jest.spyOn`, `describe`/`it` globals).

## Notes

- The `afterEach(clearAllInstances)` at module level tears down every composable instance created via `makeComposable`/`makeShared`, preventing cross-test cache leakage.
- Ids are compared as strings internally; the test explicitly covers a `'1'` (string) vs `1` (number) mismatch to pin that down.
- The "newer mutation wins" tests depend on `flush()` being called _after_ both `updateTarget` calls but _before_ resolving either — omitting it changes which optimistic value is "on top" at resolution time.
- `watchInvalidations` is defined at module scope (not inside a `describe`), making it available to both same-tick and newer-wins blocks.
