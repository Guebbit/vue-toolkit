---
source: tests/structureSearchApi/served-value.spec.ts
sha256: 89d6b0715a777aab8c1ef0defbfd95ce16bd190b4a42e6b8cdeeb28883602e9d
generated_at: 2026-09-28T23:12:17.297457+00:00
model: ollama:qwen3.8:27b
---

# tests/structureSearchApi/served-value.spec.ts

## Purpose

Verifies that a **cache-hit** path in the search composable returns the exact item values (order, fields) that were originally stored, rather than merely asserting that a network call was skipped. This is the search-API counterpart to the REST-API spec at `tests/structureRestApi/served-value.spec.ts`.

## Key elements

- **`describe('VALUE · served on a cache hit (search)')`** – single test suite focused on post-fetch read-back.
- **Test: `searchGet: returns items in order with full fields`** – calls `fetchSearch` with a resolved payload of three `USERS` fixtures, then asserts `searchGet({ q: 'a' }, 1)` returns the array in the same order with all fields intact.
- **`afterEach(clearAllInstances)`** – resets all composable instances between tests to prevent cross-contamination.

## Relationships

- **`tests/structureSearchApi/_helpers/harness.ts`** – provides `makeSearchComposable` (factory that builds the SUT) and `clearAllInstances` (teardown).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** – provides `apiResolve`, a helper that wraps a plain value into the resolved-API shape expected by `fetchSearch`.
- **`tests/structureRestApi/_helpers/fixtures.ts`** – provides the `USERS` array and the `IUser` type used as the composable's generic parameters and test data.

## Notes

- The search-API spec deliberately reuses the **REST-API** fixture and fake-API helpers (via relative `../structureRestApi/_helpers/…` imports) rather than maintaining a parallel set under `structureSearchApi`. Keep in mind when adding new fixtures: they live in the REST-API helpers directory.
- The doc comment at the top cross-references the REST-API sibling spec as the "underlying rationale" for the VALUE-vs-SKIP distinction. If you update the rationale wording there, the comment here is informational only and does not affect behavior.
