---
source: tests/structureRestApi/effects/loading-per-method.spec.ts
sha256: 8a2ed496bf86f4cf6418f73108e563c64e19fedc04f1c594634087c47c26924b
generated_at: 2026-09-28T22:48:44.764769+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/effects/loading-per-method.spec.ts

## Purpose

Table-driven spec that asserts every fetch and mutate method on the composable correctly drives `isLoading()` — `true` while the request is in flight, `false` once it settles. It holds all 12 methods to the identical loading-state contract in a single parameterized loop, so adding a new method without loading support would immediately surface a failure.

## Key elements

- **`IMethodCase`** — interface describing one row of the table: `name`, the `value` the deferred API resolves with, a `syncStart` boolean (whether `isLoading()` is already `true` synchronously after the call), and a `run` thunk that invokes the method under test.
- **`cases` (12 entries)** — one entry per composable method: `fetchAll`, `fetchByParent`, `fetchTarget` (with/without id), `fetchMultiple`, `fetchPaginate`, `fetchAny` (cached/uncached), `mutateAny`, `createTarget`, `updateTarget`, `deleteTarget`.
- **`describe.each(cases)`** — the single `it` block that (1) creates a composable, (2) fires the method against a `deferredApi` handle, (3) asserts `isLoading() === true`, (4) resolves the deferred, awaits the returned promise, (5) asserts `isLoading() === false`.
- **`syncStart` flag** — for `updateTarget` and `deleteTarget` the mutation is constructed _after_ a leading `cancelQueries()` microtask, so the test must `await flush(1)` before the first `isLoading()` assertion.

## Relationships

- **`_helpers/harness.ts`** — provides `makeComposable<IUser, number>` (the SUT factory), `clearAllInstances` (used in `afterEach` to reset state), and `flush(n)` (macrotask pump needed for the async-start mutations).
- **`_helpers/fakeApi.ts`** — provides `deferredApi<unknown>()` returning `{ call, control }`; `call` is a jest mock passed to the composable, `control.resolve(value)` releases the pending promise so the test can observe the in-flight window.
- **`_helpers/fixtures.ts`** — supplies the `USERS` array and `IUser` type used as generic parameters and as the resolve values for list/single targets.

## Notes

- `syncStart: false` on `updateTarget` / `deleteTarget` is the only non-uniform path in the table. Without `await flush(1)` the assertion `expect(c.isLoading()).toBe(true)` would fail because the mutation hasn't been registered yet.
- The file intentionally does **not** test _which_ queryKey or mutationId drives the loading state — only the boolean contract. Other specs in `effects/` cover key-level behavior.
- `afterEach(clearAllInstances)` ensures no query-client state leaks between the 12 parameterized runs.
