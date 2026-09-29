---
source: tests/structureRestApi/unit/fetchContext.spec.ts
sha256: 106b411a1f809336dceab22c2224e2f0a6bb0d4be8ff057372e278f8484b464a
generated_at: 2026-09-28T23:02:15.165941+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/fetchContext.spec.ts

## Purpose

Unit tests that verify every read `apiCall` receives an `{ signal }` fetch context as its final argument. `signal` is a real `AbortSignal` (not a mere flag), and these tests confirm it starts un-aborted and is genuinely aborted when the owning read is cancelled—by a same-record mutation or by stopping a watcher scope—so downstream `fetch`/axios calls are truly cancelled.

## Key elements

- **`describe('UNIT · the read context (signal)')`** — the sole suite; four `it` blocks cover distinct cancellation paths.
- **Test 1 – "fetchTarget receives a context…"** — asserts the captured `context.signal` is an `instanceof AbortSignal` and `aborted === false` before any cancellation.
- **Test 2 – "the signal aborts once a mutation cancels the read…"** — starts a pending `fetchTarget` (forced), then triggers `updateTarget` on the same record; verifies the signal flips to `aborted === true` before either promise resolves.
- **Test 3 – "a watcher's signal aborts once its own scope stops mid-fetch"** — same pattern but for `watchTarget`; calling `handle.stop()` mid-flight aborts the signal.
- **Test 4 – "an apiCall that ignores the context entirely still works"** — passes a zero-arg legacy-style function to confirm the context parameter is purely additive and not required.

## Relationships

- **`src/composables/structureRestApi.ts`** — source of the `IFetchContext` type (the `{ signal: AbortSignal }` shape) and the `fetchTarget` / `updateTarget` / `watchTarget` methods under test.
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — provides `deferred` and `deferredApi` to create controllable pending Promises so tests can inspect the signal _before_ resolution.
- **`tests/structureRestApi/_helpers/harness.ts`** — provides `makeComposable` (instantiates the composable under test), `flush` (microtask drain), and `clearAllInstances` (global `afterEach` teardown).
- **`tests/structureRestApi/_helpers/fixtures.ts`** — supplies the `USERS` array and `IUser` type used as test data.
- **`package.json`** — declares the Jest runner, Vue dependency, and any relevant scripts/devDependencies.

## Notes

- The context is **additive, not breaking**: test 4 deliberately passes a function with zero parameters to prove existing call signatures still work.
- Tests use `deferred` / `deferredApi` to hold Promises open, enabling assertion of the signal state _between_ initiation and resolution—a pattern specific to verifying async cancellation semantics.
- `afterEach(clearAllInstances)` runs globally for the file; no per-test cleanup is needed.
