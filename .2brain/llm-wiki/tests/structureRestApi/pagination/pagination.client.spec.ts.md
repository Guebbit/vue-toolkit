---
source: tests/structureRestApi/pagination/pagination.client.spec.ts
sha256: abe85565dfb1536472fc124767553bd574354256c7d59fa20b47739cba768921
generated_at: 2026-09-28T22:57:09.818251+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/pagination/pagination.client.spec.ts

## Purpose

Tests the **client-side (offline) pagination** mode of the composable: after a single `fetchAll` call loads every record, the `pageSize` / `pageCurrent` / `pageTotal` / `pageOffset` / `pageItemList` computed properties must slice and count correctly. Exists to guarantee the "load once, page locally" strategy before any server-side pagination is considered.

## Key elements

- **`make()`** — Local factory wrapping `makeComposable<IProduct, number>()` so each test gets a fresh, correctly-typed instance.
- **`describe('PAGINATION · client-side')`** — 9 test cases covering:
    - `pageTotal` equals 1 when all items fit on one page.
    - `pageTotal` equals `ceil(total / pageSize)` (e.g. 25 items / 10 → 3).
    - `pageItemList` returns the correct slice for page 1, page 2, and the last (partial) page.
    - `pageItemList` is empty when no data has been fetched.
    - `pageOffset` starts at 0 on page 1 and advances by `pageSize` per page.
    - `pageTotal` recalculates reactively when `pageSize` changes (10 → 5).
    - Iterating every page end-to-end yields each item exactly once, in order.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** — Supplies `makeComposable` (instantiates the SUT) and `clearAllInstances` (called in `afterEach` to reset shared state between tests).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — Supplies `apiResolve`, which wraps fixture arrays in the shape the composable's fetch method expects, simulating a resolved HTTP response without a network call.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — Supplies `buildProducts(n)` to generate deterministic product arrays of a given length, and exports the `IProduct` interface used as the item type parameter.

## Notes

- This is explicitly the **client-side** variant. A sibling spec likely covers server-side (per-page) pagination; do not confuse the two.
- The empty-items test does **not** call `fetchAll`; it verifies the zero-data edge case before any data exists.
- The "navigating every page" test mutates `pageCurrent` in a loop and then compares the collected `id` arrays — it is an integration-style check that no item is duplicated or lost across page boundaries.
