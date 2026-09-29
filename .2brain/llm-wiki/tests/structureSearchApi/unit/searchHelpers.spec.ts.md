---
source: tests/structureSearchApi/unit/searchHelpers.spec.ts
sha256: da7ff947bb371dc3f8b750844c9c225ff9cba2a803d3d77e1f92037449693dc9
generated_at: 2026-09-28T23:13:30.822786+00:00
model: ollama:qwen3.8:27b
---

# tests/structureSearchApi/unit/searchHelpers.spec.ts

## Purpose

Unit tests for `searchGet`, verifying it returns an empty array when no matching cache entry exists and that it accepts both a live filters object and a pre-serialised string key. The file exists to lock down the two input forms the API exposes without exercising the full fetch lifecycle.

## Key elements

- **`make()`** – shorthand for `makeSearchComposable<IArticle, number>()`, giving each test a fresh search composable instance.
- **`afterEach(clearAllInstances)`** – resets all composable instances between tests.
- **`describe('UNIT · searchGet')`** – the sole test group containing:
    - _"returns [] when nothing is cached"_ – calls `searchApi.searchGet` with a category that was never fetched; expects `[]`.
    - _"accepts a pre-serialised string key"_ – fetches 5 articles under `{ category: 'tech' }`, then retrieves them via `stableKey(filters)` instead of the raw object; expects length 5.

## Relationships

- **`tests/structureSearchApi/_helpers/harness.ts`** – source of `makeSearchComposable` and `clearAllInstances`; provides the composable under test and global teardown.
- **`tests/structureRestApi/_helpers/fakeApi.ts`** – provides `apiResolve`, used to simulate a resolved REST response for `fetchSearch`.
- **`tests/structureRestApi/_helpers/fixtures.ts`** – provides `buildArticles` (factory for `IArticle` arrays) and the `IArticle` type.
- **`src/internal/plainData.ts`** – provides `stableKey`, the canonical filter→string serialiser; imported here solely to exercise the pre-serialised-key path in one test.

## Notes

- There is intentionally **no public key-generator API**; callers always pass the filters object. The string-key path is tested here only via the internal `stableKey` import.
- The canonicalisation properties of `stableKey` itself are covered in `tests/internal/plainData.property.spec.ts`, not here.
- The page→ids index is a read-only derived view of the cache; there is no pruning or cap logic to test in this file (record-bound tests live in `lifecycle/maxRecords.spec.ts`).
- Test data is minimal: 5 articles, one category, page `1`. The file is not a property-based or edge-case suite.
