---
source: tests/structureRestApi/lifecycle/dependsOn.spec.ts
sha256: f87c1862d1eae68753980cde7fa71b190274d2abe1f6fef8cf4c7c21d8da3581
generated_at: 2026-09-28T22:51:37.837278+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/lifecycle/dependsOn.spec.ts

## Purpose

Spec for the `dependsOn` lifecycle option: verifies that changing the reactive value a resource depends on tears down (cancels + removes) all queries and records from the old context, that a new fetch starts clean, that active watchers re-fetch autonomously on change, and that late answers from the old context cannot clobber the new one.

## Key elements

- **`describe('LIFECYCLE · dependsOn')`** — six focused test cases:
    - _Teardown:_ changing `userId` removes all cached queries and records for the old value (checked via `queryClient.getQueryData` / `getQueryCache().findAll` and `c.itemList`).
    - _Independence:_ fetching under the new value does not resurrect data that was removed under the old value (switching back yields an empty list).
    - _`watchTarget` re-fetch:_ an active watcher calls the API again when `dependsOn` changes, without external prompting.
    - _`watchAll` re-fetch:_ same guarantee for the collection watcher.
    - _Late-answer guard:_ a hanging old-context promise that resolves after the new fetch has completed must not overwrite the new record.
    - _Deep-equal no-op:_ re-invoking the `dependsOn` getter with a new array that is value-equal to the previous one must NOT trigger teardown.
- **`afterEach(clearAllInstances)`** — resets all composable instances between tests.
- Reactive dependencies are modeled with Vue `ref` (`userId`, `locale`, `sessionRef`) passed into the `dependsOn` getter.

## Relationships

- **`_helpers/harness.ts`** — supplies `makeComposable` (the SUT factory), `clearAllInstances` (cleanup), and `flush` (microtask/flush helper used to settle reactive updates).
- **`_helpers/fakeApi.ts`** — supplies `apiResolve` (immediately-resolving API stub) and `deferred` (manually-resolvable promise used to simulate a hanging old-context fetch).
- **`_helpers/fixtures.ts`** — supplies the `USERS` fixture array and the `IUser` type used across all assertions.
- **`package.json`** — root dependency manifest (Vue, Jest, etc.).

## Notes

- The header comment explicitly scopes this file: late-write / late-rollback semantics live in `lateWrite.spec.ts` / `lateRollback.spec.ts`; cross-resource isolation lives in `intention/resource-isolation.spec.ts`. Don't duplicate those scenarios here.
- The deep-equal test (last case) guards against a regression where `dependsOn` returning a _new_ array literal with identical values would be treated as a "change" and tear down valid data.
- The "independence" test switches back to the original value and asserts the list is empty — confirming removal (not just hiding) of old cache entries.
