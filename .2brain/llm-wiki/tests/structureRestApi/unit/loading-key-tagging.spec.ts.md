---
source: tests/structureRestApi/unit/loading-key-tagging.spec.ts
sha256: 9282e1d7d0fc67f0af87870cf427d9c6e53a875202661d5636f8ff15c4224c98
generated_at: 2026-09-28T23:03:57.023951+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/loading-key-tagging.spec.ts

## Purpose

Verifies that the mutation methods (`createTarget`, `updateTarget`, `deleteTarget`) and the `watch*` family stamp their TanStack Query call's `meta` with the caller-supplied `key`, so that `isLoading(key)` returns `true` only for the specific operation the caller tagged—not for any arbitrary in-flight request on the same resource. Complements `loading.spec.ts`, which covers `fetchAny`.

## Key elements

- **`describe('UNIT · isLoading(key) tagging on mutations and watch*')`** — single block containing four specs, one per method family.
- **`make()`** — shorthand factory: `makeComposable<IUser, number>()`, creating a fresh composable instance per test.
- **`afterEach(clearAllInstances)`** — tears down all composable instances after each test to prevent cross-test leakage.
- **`deferredApi<T>()`** — returns a `{ call, control }` pair; `call` is a promise the composable consumes, `control.resolve(...)` settles it so the test can assert loading state before and after resolution.
- **`flush()`** — advanced microtasks to let `updateTarget`/`deleteTarget` complete their leading `cancelQueries` step before the mutation is registered.

## Relationships

- **`_helpers/harness.ts`** — provides `makeComposable` (instantiates the system under test), `clearAllInstances` (lifecycle teardown), and `flush` (microtask drain).
- **`_helpers/fakeApi.ts`** — provides `deferredApi`, the controllable promise source that lets tests observe a loading window without real network I/O.
- **`_helpers/fixtures.ts`** — supplies the `IUser` type and `USERS` array used as realistic payloads for both the composable's generic parameters and the resolved values.

## Notes

- `updateTarget` and `deleteTarget` tests call `flush()` **before** asserting `isLoading` is `true`; the mutation is only registered after a leading `cancelQueries` microtask resolves. Omitting `flush()` would yield a false-negative (loading not yet tagged).
- The scope is deliberately limited: `fetchAny` key-tagging is tested in the sibling `loading.spec.ts` file to keep each spec focused on one method surface.
