---
source: tests/structureRestApi/unit/deleteTarget.spec.ts
sha256: 35c6a6ef5be6ae4c2c822e2ed1295daf8e020c4e79c5b317fde56d81c42c74f3
generated_at: 2026-09-28T23:01:07.679358+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/deleteTarget.spec.ts

## Purpose

Unit tests for the `deleteTarget` method of the composable. Verifies the optimistic-delete contract: immediate local removal with the API ack, rollback (and invalidation) on failure, cancellation of a concurrent in-flight read of the same record, and correct mutation-key shape.

## Key elements

- **`make()`** — thin wrapper around `makeComposable<IUser, number>()` that produces a fresh instance per test.
- **`describe('UNIT · deleteTarget', …)`** — seven `it` blocks covering:
    - Immediate removal + resolved API ack; `itemList` shrinks.
    - Rollback restores the original record on API rejection.
    - A post-delete `fetchTarget` must hit the network (id is invalidated, not served from cache).
    - A _rollback_ invalidation is stronger than a plain delete: the restored record is untrusted, so a subsequent read reconciles with the server.
    - An in-flight `fetchTarget` on the same id is cancelled and **resolves** with the last cached value (not a rejection).
    - A late (post-delete) resolution of that cancelled read cannot resurrect the record.
    - Numeric id `1` is stringified to `'1'` in the mutation key, matching `resourceKeys.ts` conventions.
- **`afterEach(clearAllInstances)`** — disposes all composable instances between tests.

## Relationships

- **`_helpers/harness.ts`** — supplies `makeComposable` (builds the composable under test), `clearAllInstances` (teardown), and `flush` (advances microtask/macrotask queues for async assertions).
- **`_helpers/fakeApi.ts`** — supplies `apiResolve` / `apiReject` (one-shot mock responses) and `deferredApi` (a controllable Promise pair used to interleave in-flight reads with the delete).
- **`_helpers/fixtures.ts`** — supplies the `USERS` array (seed data) and the `IUser` type used to parameterise the composable.

## Notes

- **Rollback ≠ server truth.** The spec explicitly treats a rolled-back record as a _guess_; any later read of that id must re-fetch. This is a deliberate design decision beyond simple undo.
- **Cancellation resolves, not rejects.** A concurrent `fetchTarget` cancelled by `deleteTarget` resolves with the previously cached value. Tests assert `resolves`, not `rejects`.
- **ID stringification is a contract, not a detail.** The last test pins `mutationKey[2]` to the string `'1'` so that `whatSaving(id)` and filter matching stay consistent with `resourceKeys.ts#target()`.
