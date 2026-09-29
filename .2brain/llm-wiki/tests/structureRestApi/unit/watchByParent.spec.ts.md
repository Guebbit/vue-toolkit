---
source: tests/structureRestApi/unit/watchByParent.spec.ts
sha256: 935b4c7aa5d119fde04259e5eaf463100768dbd8579f027f4da446ddb4fc38c2
generated_at: 2026-09-28T23:07:16.438184+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/watchByParent.spec.ts

## Purpose

Unit test suite for the `watchByParent` composable method — the reactive, always-active counterpart of `fetchByParent` scoped to a `belongsTo` parent. Verifies that it updates `parentHasMany`/`getListByParent` on initial fire and on cache invalidation without requiring an imperative refetch call, and that it correctly handles nullish parent ids, `enabled` gating, and reactive keys.

## Key elements

- **`make()`** — local factory wrapping `makeComposable<IUser, number>()` from the harness; every test gets a fresh, isolated composable instance.
- **`afterEach(clearAllInstances)`** — tears down all composable instances between tests to prevent cross-test state leakage.
- **Test cases** (one `it` block each):
    - Immediate fire + `getListByParent` population.
    - Two parents tracked independently (no cross-contamination).
    - Return shape `{ stop, refetch }`; `refetch()` triggers a second `apiCall` and resolves current items.
    - `stop()` detaches from further cache-invalidation reactivity.
    - Nullish parent id (`ref(undefined)`) idles: no `apiCall`, no fetch; kicks in once the ref becomes a real id.
    - `refetch()` while parent id is still nullish resolves `[]` **without** calling `apiCall` (guards against TanStack's default "run even when disabled" behavior).
    - `enabled: false` option: no fetch until the ref flips to `true`.
    - Reactive `key` option: changing the key value re-triggers `apiCall`.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** — provides `makeComposable` (creates a fully-wired composable with a query client), `clearAllInstances` (cleanup), and `flush` (microtask/`nextTick` drain). All tests depend on these.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — provides `buildUsers(count, offset)` for generating deterministic `IUser[]` arrays and the `IUser` type used as the composable's generic parameter.
- **`package.json`** — declares the runtime/test dependencies exercised here: `vue` (`ref`), `jest` globals, and the composable library under test.

## Notes

- The nullish-idle behavior is the trickiest contract: `watchByParent` must **never** pass `undefined` to `apiCall`, and `refetch()` under that condition must short-circuit to `[]` rather than letting TanStack's query engine attempt a fetch. Two separate tests pin this down.
- `enabled` and `key` are passed as reactive refs inside an options object, not as plain values — tests mutate `.value` to assert reactivity.
- The composable is parameterized as `makeComposable<IUser, number>()`, tying the data shape and parent-id type together; swap these if the API under test changes its generics.
