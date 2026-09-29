---
source: tests/structureSearchApi/search/search.params.spec.ts
sha256: c5fb2ad621b9c028687eaf32f6f68146bd869b7a2b40a7a6e6c90ddced116468
generated_at: 2026-09-28T23:12:05.265434+00:00
model: ollama:qwen3.8:27b
---

# tests/structureSearchApi/search/search.params.spec.ts

## Purpose

Verifies that the search API's cache bucketing treats filter parameters as a stable dimension: identical filter objects (regardless of key order at any nesting depth) resolve to the same cache entry, while any difference in values or properties produces a distinct bucket. Covers flat primitives, arrays of primitives, and nested-object shapes (sort/range/geo-style).

## Key elements

- **`describe('SEARCH · filter parameters')`** – the sole suite; each `it` block asserts one cache-bucketing rule.
- **`make()`** – shorthand for `makeSearchComposable<IArticle, number>()`, returning a fresh composable per test.
- **`TECH` / `SPORT`** – pre-built fixture arrays (5 and 3 articles) used as mock API responses.
- **`resolveTech()` / `resolveSport()`** – wrap `apiResolve` to produce a one-shot mock resolver for the respective fixture set.
- **`afterEach(clearAllInstances)`** – ensures no cache state leaks between tests.

## Relationships

- **`tests/structureSearchApi/_helpers/harness.ts`** – provides `makeSearchComposable` (under-test subject) and `clearAllInstances` (teardown).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** – provides `apiResolve`, the mock HTTP resolver that records call counts and returns canned payloads.
- **`tests/structureRestApi/_helpers/fixtures.ts`** – provides `buildArticles` (deterministic article arrays) and the `IArticle` type used as the generic parameter.

## Notes

- The doc comment references `stableKey` (in `internal/plainData.ts`) as the serialization mechanism, but that module is **not** imported here—this spec tests it indirectly through observable cache-hit/miss behavior.
- Nested-object tests specifically assert key-order independence _below_ the top level (e.g. `{ sort: { by, dir } }` vs `{ sort: { dir, by } }`), which is a stricter guarantee than a shallow key-sort would provide.
- `searchGet` is exercised only once (in the "returns stored results" test); the remaining tests rely solely on `fetchSearch` call-count assertions to infer bucket identity.
