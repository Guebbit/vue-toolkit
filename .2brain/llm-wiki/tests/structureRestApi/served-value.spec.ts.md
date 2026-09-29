---
source: tests/structureRestApi/served-value.spec.ts
sha256: ffa8b3c01378df7aa2dda99d86e36d0ba1a7864b95b00a68e78d9a9e49e7d7eb
generated_at: 2026-09-28T22:58:08.182950+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/served-value.spec.ts

## Purpose

Verifies that the composable cache returns the **correct data** on cache hits and refetches, not merely that network calls were skipped. While other specs in this directory assert `mock.not.toHaveBeenCalled()`, this file pins the actual item values (e.g. `role` field) to catch a cache that would serve stale or garbage data while still passing call-count assertions.

## Key elements

- **`make()`** — shorthand for `makeComposable<IUser, number>()`, returning a fresh composable instance for each test.
- **`v(role)`** — factory that builds a minimal `IUser` literal with a controllable `role` string, used to distinguish "first" vs "second" API responses.
- **`describe('VALUE · served on a cache hit')`** — the sole suite; six `it` blocks covering:
    - `fetchAll` cache-hit retains the original value (later response never applied).
    - `fetchAll` with `{ forced: true }` replaces the stored value.
    - `fetchTarget` cold path resolves the full item.
    - `fetchTarget` warm path (prior `fetchTarget`) resolves from cache without calling the API.
    - `fetchMultiple` warm path returns full field data, not just a count match.
    - `fetchTarget` warm path seeded by a prior `fetchAll` resolves the item.

## Relationships

- **`_helpers/harness.ts`** — provides `makeComposable` (constructs the SUT) and `clearAllInstances` (used in `afterEach` to reset state between tests).
- **`_helpers/fakeApi.ts`** — provides `apiResolve`, which wraps a plain value in a mockable API-responder object so tests can both supply data and assert on call counts.
- **`_helpers/fixtures.ts`** — provides the `USERS` fixture array and the `IUser` type used as the composable's item shape.

## Notes

- The file intentionally uses a two-step pattern (first fetch with value A, second fetch with value B) to prove the cache serves A, not B. Swapping the role string (`v('v1')` vs `v('v2')`) is the sole mechanism for this assertion.
- `getRecord(1)` is the only way to inspect stored cache state; the composable does not expose a public "all records" snapshot in these tests.
- The last test in the suite (warm-from-list) is the one that pins the cross-producer `{ data }` entry shape contract: a record written by `fetchAll` must be readable by `fetchTarget` without any shape translation.
