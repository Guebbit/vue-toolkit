---
source: tests/structureRestApi/modifiers/forced.spec.ts
sha256: c71519f0e19420e036c72086a022dbc166aee1caad3fc438f4ea79157f901c4e
generated_at: 2026-09-28T22:55:38.488291+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/modifiers/forced.spec.ts

## Purpose

Tests the `forced: true` modifier option across every cached fetch method of the composable. Verifies two contracts: (1) a forced call bypasses a still-fresh cache entry and issues a new API call, and (2) a forced call **joins** an in-flight request for the same data rather than firing a second one.

## Key elements

- **`describe('MODIFIER · forced', …)`** — five `it` blocks, one per fetch method (`fetchAll`, `fetchTarget`, `fetchByParent`, `fetchMultiple`, `fetchAny`), asserting that the second call's mock `toHaveBeenCalledTimes(1)`.
- **`fetchTarget` replacement test** — additionally asserts `c.getRecord(1)?.name` reflects the new payload, confirming the cached value is overwritten.
- **`describe('… forced joins a concurrent call …')`** — three `it` blocks using `deferredApi` to hold a promise open; fires both a plain and a forced call before resolving, then asserts a single API call and that both Promises resolve to the same value.
- **`afterEach(clearAllInstances)`** — resets the composable singleton between tests.

## Relationships

- **`_helpers/harness.ts`** — `makeComposable<T, K>()` creates a fresh composable instance per test; `clearAllInstances()` tears it down.
- **`_helpers/fakeApi.ts`** — `apiResolve(value)` wraps a value in a jest-mocked async function (so `toHaveBeenCalledTimes` works); `deferredApi<T>()` returns `{ call, control }` where `control.resolve(v)` settles the pending promise, enabling the concurrent-join scenarios.
- **`_helpers/fixtures.ts`** — supplies the `IUser` type, the `USERS` array, and `buildUsers(count, parentId)` for generating parent-scoped fixtures.

## Notes

- The `fetchAny` test uses an inline `jest.fn(() => Promise.resolve(n))` rather than `apiResolve`, because `fetchAny` resolves to a single scalar (an id), not an entity array.
- In the concurrent-join tests both calls share the **same** `call` function reference; the composable deduplicates by the in-flight Promise, not by call-site identity.
- "Fresh cache entry" is implied by the fact that the first call resolved successfully before the forced second call—no explicit TTL or expiry is involved.
