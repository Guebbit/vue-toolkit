---
source: tests/structureRestApi/lifecycle/lateRollback.spec.ts
sha256: 4b09b6c071386075458323b91c98e5c62f987c8eeefcaab68395240eb9226957
generated_at: 2026-09-28T22:52:12.279112+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/lifecycle/lateRollback.spec.ts

## Purpose

Tests the late-write guard applied to **rollback** operations in the composable. The core rule under test: a rollback (restore-on-failure) is itself a write, so it must be discarded if `dependsOn` has changed before the in-flight mutation settles — otherwise the previous user's data would leak into the next user's view. Also covers optimistic-create placeholders and non-record API responses under the same guard.

## Key elements

- **`describe('LIFECYCLE · rollbacks after a dependsOn change')`** — verifies that a failed `updateTarget` or `deleteTarget` initiated under user A does _not_ restore the old record once `dependsOn` has moved to user B; also confirms rollback _does_ fire when `dependsOn` is unchanged.
- **`describe('LIFECYCLE · an optimistic mutation whose scope died mid-flight')`** — after `dependsOn` changes, a late success writes nothing and triggers no `invalidateQueries`; a late failure neither rolls back nor invalidates.
- **`describe('LIFECYCLE · createTarget placeholders and late answers')`** — placeholder record is visible while in-flight, replaced on success, removed on failure; a create that resolves after scope death returns the item but stores nothing.
- **`describe('LIFECYCLE · updateTarget with a response that is not a record')`** — parameterized (`it.each`) test: string, array, and `null` bodies are returned to the caller, while only the optimistic patch is stored.
- **`watchInvalidations(c)`** — local helper that `jest.spyOn`s `c.queryClient.invalidateQueries` to assert no invalidation fires after scope loss.
- **`afterEach(clearAllInstances)`** — global teardown ensuring no composable instance leaks between tests.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** — imports `makeComposable` (builds the composable under test with a configurable `dependsOn`), `clearAllInstances` (teardown), and `flush` (microtask/macrotask pump to let reactive updates settle).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — imports `apiResolve` / `apiReject` (instant Promise wrappers) and `deferredApi` (returns a `{ call, control }` pair so the test can resolve/reject the API at a chosen moment).
- **`tests/structureRestApi/_helpers/fixtures.ts`** — imports the `USERS` array and the `IUser` type used as the record shape throughout.
- **`package.json`** — provides the Jest test runner, Vue reactivity (`ref`), and `@tanstack/vue-query` (`QueryClient` type used by `watchInvalidations`).

## Notes

- The `dependsOn` reactive ref (`ref('alice')` → `ref('bob')`) is the mechanism that simulates a user switching; flipping it mid-flight is what triggers the late-write guard.
- Every late-write assertion ends by switching `userId` back to `'alice'` and asserting the record is still `undefined` — confirming the write was dropped, not merely deferred.
- The `it.each` block for non-record responses includes an `eslint-disable` for `unicorn/no-null` because `null` is the literal body under test.
- `watchInvalidations` is defined at module scope (between `describe` blocks) rather than inside a specific block, making it available to any `describe` below its definition.
