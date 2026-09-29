---
source: tests/structureRestApi/lifecycle/view.spec.ts
sha256: 86e43ba7f8b7ec74d4fdf0c683916786c097234ae816dd71f001a733d857ae5e
generated_at: 2026-09-28T22:54:48.453948+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/lifecycle/view.spec.ts

## Purpose

Validates the core design invariant that the composable's record view is a _live, read-only projection_ of the shared `QueryClient` rather than a separate copy. Every test bypasses the composable's public API and mutates the `QueryClient` directly (or from a second instance), then asserts the view reflects the change. A second group of tests confirms that Vue's `readonly()` enforces immutability on both individual records and the dictionary object.

## Key elements

- **`describe('LIFECYCLE · the view follows the shared QueryClient directly')`** — the sole top-level block; six `it` cases covering:
    - `setQueryData` written directly on `c.queryClient` appears in `getRecord` / `itemList`
    - `removeQueries` (exact key) removes a single record from the view
    - `queryClient.clear()` empties the entire view
    - Two composable instances sharing one `queryClient` see each other's writes
    - Mutating a returned record in place is rejected (readonly)
    - Writing a new key onto `itemDictionary.value` is rejected (readonly)
- **`afterEach`** — calls `clearAllInstances()` and `jest.restoreAllMocks()` to reset state and tear down `console.warn` spies even when an assertion already failed.

## Relationships

- **`_helpers/harness.ts`** — supplies `makeComposable` (instantiates the SUT with an optional shared `queryClient`) and `clearAllInstances` (teardown).
- **`_helpers/fakeApi.ts`** — supplies `apiResolve`, which wraps a payload into a resolved Promise so the composable's `fetchTarget`/`fetchAll` complete synchronously for test purposes.
- **`_helpers/fixtures.ts`** — supplies the `USERS` array (seed data) and the `IUser` type used as the generic parameter for `makeComposable`.

## Notes

- Vue's `readonly()` in dev mode signals a rejected write via `console.warn`, **not** a thrown exception. Tests must therefore `jest.spyOn(console, 'warn')` and assert it was called; they must _not_ use `expect(...).toThrow()`.
- The `afterEach` block intentionally restores **all** mocks (not just the ones the current test set up) so that a `console.warn` spy created in one test cannot leak into the next.
- The "second instance" test constructs composable `b` with an explicit `queryClient: a.queryClient` option, confirming the harness supports injecting a shared client.
