---
source: tests/structureRestApi/unit/fetchPaginate.spec.ts
sha256: 5f3ef390ab28db5c786d700c9f4c48c7065750cda82e13b4064e1f4c29224fc8
generated_at: 2026-09-28T23:02:39.801667+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/fetchPaginate.spec.ts

## Purpose

Unit tests for the `fetchPaginate` method, verifying its contract: it fetches a single page of server-side pagination results, resolves with the items, stores them on the composable, and handles empty pages without error. It intentionally does **not** test filter/search behaviour — that belongs to `useStructureSearchApi.fetchSearch`.

## Key elements

- **`describe('UNIT · fetchPaginate')`** — top-level test suite containing three `it` blocks.
- **`make()`** — local factory that calls `makeComposable<IProduct, number>()` from the harness to produce a fresh composable instance per test.
- **Test: "resolves with the page items"** — asserts the returned array has length 10 when the fake API resolves 10 products.
- **Test: "stores the returned items"** — asserts `c.getRecord(1)` and `c.getRecord(10)` are defined after `fetchPaginate` completes.
- **Test: "resolves an empty page cleanly"** — asserts the promise resolves to `[]` when the API returns an empty array.
- **`afterEach(clearAllInstances)`** — tears down any registered composable instances between tests.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** — provides `makeComposable` (generic composable factory with `fetchPaginate` and `getRecord` methods) and `clearAllInstances` (cleanup).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — provides `apiResolve`, which wraps a value in a promise shape the composable's fetch method expects, simulating a resolved HTTP response.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — provides `buildProducts(count, offset)` for generating `IProduct` arrays and the `IProduct` type used as the composable's item generic.

## Notes

- The header comment explicitly scopes this file to the "one page at a time" contract. If you need filter/search coverage, look at the `useStructureSearchApi` tests instead — they are built on top of this method.
- `fetchPaginate` is called with three arguments: the (fake) API promise, a page number, and a page size. The page number is what `getRecord` keys on, not an index into the array.
