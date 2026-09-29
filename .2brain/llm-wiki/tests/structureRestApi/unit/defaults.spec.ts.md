---
source: tests/structureRestApi/unit/defaults.spec.ts
sha256: d8c2a9fc4755d4fab34c5beb98ff14b4e92f561d76b5434f0378020a4851f2c9
generated_at: 2026-09-28T23:00:52.947964+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/defaults.spec.ts

## Purpose

Unit tests verifying the "empty defaults" invariant: every defaulted array parameter and every `?? []` fallback in the resource composable must yield an empty result (empty array, empty lists, no phantom elements) when the argument or cache entry is absent.

## Key elements

- **`make()`** — local factory that calls `makeComposable<IUser, number>()` to produce a fresh composable instance per test.
- **`describe('UNIT · empty defaults')`** — contains six `it` blocks covering:
    - `fetchAll` with an immediately-resolving empty list → returns `[]` and stores nothing in `itemDictionary`.
    - `fetchAll` cancelled via `queryClient.cancelQueries()` on a cold cache → resolves to `[]`.
    - `checkMultiple()` with no arguments → `{ cachedIds: [], expiredIds: [] }`.
    - `fetchByParent` still in-flight → `parentHasMany` entry is `[]`.
    - `addToParent` on a cold cache → links only the explicitly passed child id.
    - `createResourceKeys('resource', () => []).entry('all', [])` → `['resource', 'all', []]` (no extra key segments).

## Relationships

- **`src/internal/resourceKeys.ts`** — imports `createResourceKeys`; the final test exercises its `entry()` method directly to confirm the key-array shape when the scope array is empty.
- **`tests/structureRestApi/_helpers/harness.ts`** — imports `makeComposable` (test-instance factory), `clearAllInstances` (wired into `afterEach`), and `flush` (microtask/queue drain).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — imports `apiResolve` (immediate-resolution mock) and `deferredApi` (deferred-resolution mock) to simulate API responses.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — imports `type IUser` as the generic entity parameter for the composable.

## Notes

- The spec mixes composable-level tests (first five) with a direct test of the `createResourceKeys` helper (last test). The latter is the only test in this file that does not go through the composable's public API.
- All tests rely on `flush()` or `await` to settle microtasks before asserting; no real timers are used.
- `afterEach(clearAllInstances)` is the sole global cleanup — there is no per-test teardown beyond that.
