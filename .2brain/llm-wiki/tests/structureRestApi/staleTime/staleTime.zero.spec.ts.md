---
source: tests/structureRestApi/staleTime/staleTime.zero.spec.ts
sha256: d414a4a096df066427f80e39308aff5773479bd6a3b57dc6ca0351ee504b1c14
generated_at: 2026-09-28T22:59:58.603083+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/staleTime/staleTime.zero.spec.ts

## Purpose

Verifies that a `staleTime` of `0` makes data _never fresh_—every `fetchAll`/`fetchTarget` call refetches from the API, and `checkAll`/`checkTarget` always report a miss. This edge case is not exercised by the default 1-hour staleTime suite, so it gets its own spec.

## Key elements

- **`afterEach(clearAllInstances)`** — resets all composable instances between tests to prevent cross-test contamination.
- **Test 1: "fetchAll with staleTime 0 refetches every time"** — creates a composable with `{ staleTime: 0 }`, calls `fetchAll` twice, asserts the second API mock was invoked (not served from cache).
- **Test 2: "checkAll / checkTarget report a miss when staleTime is 0"** — after a successful fetch, asserts `checkAll()` and `checkTarget(1)` both return `false`.
- **Test 3: "a per-call staleTime of 0 overrides a fresh default staleTime"** — uses a default (1 h) composable, passes `{ staleTime: 0 }` on the second `fetchAll` call, asserts refetch occurs and `checkAll({ staleTime: 0 })` reports a miss.

## Relationships

- **`_helpers/harness.ts`** — imports `makeComposable` (builds the composable under test with configurable options) and `clearAllInstances` (teardown).
- **`_helpers/fakeApi.ts`** — imports `apiResolve` to create a mock API promise whose call count can be asserted.
- **`_helpers/fixtures.ts`** — imports the `USERS` array and the `IUser` type used as the composable's entity/key types.

## Notes

- `staleTime: 0` follows TanStack Query semantics: data is stale once its _age_ reaches `staleTime`, so age 0 ≥ 0 means it is stale immediately. This is distinct from "no cache at all."
- Test 3 demonstrates that a **per-call** `staleTime` option (passed in the second argument of `fetchAll` / `checkAll`) overrides the instance-level default—important if callers need a one-shot bypass without reconfiguring the composable.
- The `IUser, number` generics in `makeComposable` indicate the composable is typed with an entity interface and a numeric key type; this matches the fixture shape.
