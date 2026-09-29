---
source: tests/structureRestApi/unit/isSaving.spec.ts
sha256: 0ffb5905e7711400778fcbc40e339935724c0a5b8f16c65803d410ed24df995b
generated_at: 2026-09-28T23:03:25.833529+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/isSaving.spec.ts

## Purpose

Unit tests for the `isSaving(id)` method on the composable—a per-record pending signal intended for row-level spinners, distinct from the whole-resource `loading`/`isLoading` flag. Verifies its truthiness across update, delete, create, cross-resource, and failure scenarios.

## Key elements

- **`describe('UNIT · isSaving')`** — the sole test suite; every `it` block asserts a specific `isSaving` transition.
- **`make()`** — local factory: `() => makeComposable<IUser, number>()`, creating a fresh composable per test.
- **`afterEach(clearAllInstances)`** — tears down all composable instances between tests to prevent state leakage.
- **Test cases** (one per `it`):
    - Initial state is `false`.
    - `true` during an in-flight `updateTarget`, `false` for an unrelated id; resets to `false` after resolution.
    - `true` during an in-flight `deleteTarget`; resets after resolution.
    - String/number id equivalence (`'1'` ≡ `1`) when the composable is typed `number | string`.
    - Isolation across `resourceKey` scopes: same numeric id in a different resource does **not** trigger `isSaving` on the other composable.
    - `isSaving` resets to `false` after a **rejected** mutation.
    - A plain `createTarget` (no pre-existing id) never sets `isSaving` for any id.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** — supplies `makeComposable` (the SUT factory), `clearAllInstances` (teardown), `flush` (drives microtask/macrotask queues so in-flight-read cancellation completes), and `newTestClient` (an isolated `QueryClient` for the multi-resource test).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — supplies `deferredApi`, which returns a controllable `{ call, control }` pair so tests can start a mutation and assert intermediate state before resolving or rejecting.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — supplies the `USERS` seed array and the `IUser` type used as the generic parameter for composable instances.

## Notes

- `isSaving(id)` does **not** turn `true` synchronously on the `updateTarget`/`deleteTarget` call. The mutation first cancels the record's in-flight reads; `isSaving` only flips after that cancellation settles. Tests must `await flush()` before asserting `true`.
- The "same id in another resource" test uses two composables sharing one `QueryClient` but with different `resourceKey` values—this is the scope boundary that keeps `isSaving` per-resource.
- The create test asserts `isSaving` is `false` for _every_ id (including the eventual `USERS[0].id`), because a create has no stable key to attach the signal to.
