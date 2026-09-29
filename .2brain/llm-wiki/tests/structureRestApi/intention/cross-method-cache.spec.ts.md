---
source: tests/structureRestApi/intention/cross-method-cache.spec.ts
sha256: 2f1793ff0992d45dfadfdb7bad12d557af87c1594a834811a3e89373e0d9a261
generated_at: 2026-09-28T22:49:15.015342+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/intention/cross-method-cache.spec.ts

## Purpose

Verifies the cross-method cache-seeding contract: any "producer" method (fetchAll, fetchByParent, createTarget, updateTarget) writes items into the shared per-item target cache, so a later `fetchTarget` or `fetchMultiple` for those IDs resolves from cache without invoking the network. The final test additionally pins the return-value guarantee—that a warm `fetchTarget` returns the exact item a producer stored.

## Key elements

- **`describe('INTENTION · cross-method cache seeding')`** — groups all assertions under the project's "intention" convention (documents _what the API is supposed to do_, not merely _what it happens to do_).
- **Six `it` blocks**, each following the pattern: call a producer → call a consumer with a spy (`apiResolve`) → assert the spy was **not** called and (where relevant) the returned value is correct.
- **`makeComposable<IUser, number>()`** — instantiates the composable under test with the user/number generics.
- **`apiResolve(value)`** — a spy-wrapped resolver: calling it records the invocation _and_ returns a resolved promise with `value`. Tests assert `not.toHaveBeenCalled()` to prove the network path was bypassed.
- **`c.getRecord(id)`** — used once to confirm the record entry holds the expected item after `fetchAll` + warm `fetchTarget`.
- **`afterEach(clearAllInstances)`** — resets all composable instances between tests to prevent cross-test cache leakage.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** — supplies `makeComposable` (the object under test) and `clearAllInstances` (teardown).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — supplies `apiResolve`, the call-recording mock used as the "network" stand-in in every test.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — supplies the `USERS` array and `IUser` type that shape the test data and generic parameters.

## Notes

- The "INTENTION" prefix in the describe label is a project-wide naming convention distinguishing behavior-contract tests from regression or implementation-detail tests.
- The last test ("fetchTarget RETURNS the item seeded by a prior list fetch") is deliberately separate from the first: the first only checks the cache hit + record; the last additionally asserts the **resolved value** equals the seeded item, locking the return-value contract explicitly.
- `apiResolve` is both a spy and a promise-resolver in one; this is what lets the tests pass a "fake network call" that the composable can `await` while the test can later inspect call count.
