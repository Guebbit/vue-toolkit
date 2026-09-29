---
source: tests/structureRestApi/unit/watchAll.spec.ts
sha256: 8698ebc611378ffeddef1ce73c4c0b7519ea49f548d95fb2b2fa798a60520975
generated_at: 2026-09-28T23:06:43.569985+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/watchAll.spec.ts

## Purpose

Unit tests for the `watchAll` composable method. Verifies that it fires immediately on subscription, populates the item dictionary identically to `fetchAll`, exposes a working `stop()`/`refetch()` contract, filters `undefined` entries, and supports reactive `enabled` and `key` options. Scope is limited to the direct one-shape-at-a-time contract; invalidation/`dependsOn` reactivity is tested elsewhere.

## Key elements

- **`make()`** — one-line factory calling `makeComposable<IUser, number>()` from the harness; used by every test to get a fresh composable instance.
- **`afterEach(clearAllInstances)`** — global teardown ensuring no composable instances leak between tests.
- **Test cases (7 `it` blocks):**
    - _Fires immediately / populates dictionary_ — asserts one API call and 3 items in `c.itemList`.
    - _`stop` / `refetch` contract_ — confirms `refetch()` re-invokes the API call (ignoring `staleTime`) and resolves the current items.
    - _`stop()` halts reactivity_ — after `stop()`, an `invalidateQueries` call does **not** trigger a refetch.
    - _Skips `undefined` entries_ — same filtering behavior as `fetchAll`.
    - _`key` namespacing_ — two concurrent `watchAll` calls with different keys each fire exactly once, independently.
    - _Reactive `enabled`_ — with `enabled: ref(false)` no call is made; flipping to `true` triggers exactly one call.
    - _Reactive `key`_ — changing the key ref triggers a second API call.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** — provides `makeComposable` (the composable factory under test), `clearAllInstances` (teardown), and `flush` (microtask/promise queue drain used instead of manual `await` chains).
- **`tests/structureRestApi/_helpers/fixtures.ts`** — exports the `USERS` array (3 `IUser` objects) and the `IUser` type used to parameterize the composable.
- **`package.json`** — declares the Jest test runner and the project dependencies (Vue, etc.) that these tests execute against.

## Notes

- The file header comment explicitly carves out invalidation and `dependsOn` reactivity into `intention/invalidation-refetch.spec.ts` and `lifecycle/dependsOn.spec.ts`—don't expect those behaviors here.
- Every test that calls `watchAll` must call `stop()` (even after assertions) to release the subscription; omitting it can cause cross-test interference via the shared `queryClient`.
- `refetch()` is documented (in-assertion comment) as _always_ re-running the fetch, bypassing `staleTime`—this is an intentional contract, not a side effect.
- `flush` from the harness is the idiom for letting promises resolve; avoid mixing in `jest.useFakeTimers` here.
