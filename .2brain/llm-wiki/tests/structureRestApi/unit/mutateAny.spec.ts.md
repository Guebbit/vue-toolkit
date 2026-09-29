---
source: tests/structureRestApi/unit/mutateAny.spec.ts
sha256: ab7c601f86b19047a7d1ca3b5a3a1f47877f82c0f99af2bec524dc88c1db9419
generated_at: 2026-09-28T23:05:14.414640+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/mutateAny.spec.ts

## Purpose

Unit tests for the `mutateAny` method on the structure-restApi composable. `mutateAny` is a one-shot TanStack mutation for commands that don't fit the record shape of `createTarget`/`updateTarget`/`deleteTarget`. These tests pin down its three behavioral contracts: it resolves/rejects with the API result, it contributes to `isLoading(key)` while in flight, and it does **not** auto-invalidate any cached lists on success.

## Key elements

- **`make()`** — factory that calls `makeComposable<IUser, number>()` to produce a fresh composable per test.
- **`describe('UNIT · mutateAny')`** — five `it` blocks covering:
    - Resolution: `mutateAny` resolves with the `apiCall` return value.
    - Rejection: `mutateAny` rejects (and propagates the error) when the `apiCall` rejects.
    - Loading state: `isLoading(key)` is `true` while in flight, `false` after settle; unrelated keys are unaffected.
    - No invalidation: a prior `fetchAll` result remains cached after a successful `mutateAny` (the fetch mock is called only once).
    - No leaked observer: `isLoading()` reads `false` even after a rejected `mutateAny`, confirming the internal mutation observer's `reset()` runs on both success and failure paths.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** — supplies `makeComposable` (the composable factory under test) and `clearAllInstances` (teardown via `afterEach`).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — supplies `deferredApi`, a helper that returns a controllable `{ call, control }` pair so tests can assert in-flight state before resolving/rejecting.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — supplies the `USERS` array and `IUser` type used to seed a realistic list in the no-invalidation test.

## Notes

- The no-invalidation test is the critical behavioral differentiator: it asserts `mutateAny` is intentionally _decoupled_ from the cache, unlike the record-shaped mutations.
- The "dangling observer" test guards against a subtle bug: a one-shot TanStack `MutationObserver` that skips `reset()` on the error path would leave `isMutating()`/`isLoading()` stuck at `true` indefinitely.
- Type parameters `<IUser, number>` are arbitrary here — `mutateAny` doesn't depend on the record type; they exist only to satisfy the composable's generic signature.
