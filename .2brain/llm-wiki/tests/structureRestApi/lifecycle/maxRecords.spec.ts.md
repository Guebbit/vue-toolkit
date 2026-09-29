---
source: tests/structureRestApi/lifecycle/maxRecords.spec.ts
sha256: e396737cd6e51868f66a78f1892e93ebd0651cf9e5456f7d2c48b5a86935ea29
generated_at: 2026-09-28T22:53:16.104529+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/lifecycle/maxRecords.spec.ts

## Purpose

Tests the `maxRecords` lifecycle rule: a hard cap on how many records a resource keeps cached. Verifies the wipe-before-store backstop, its boundary conditions, its interaction with list caches, and its interaction with active watchers (`watchTarget`, `watchAll`).

## Key elements

- **`make(maxRecords)`** — shorthand factory that calls `makeComposable<IArticle, number>({ maxRecords })`, returning a configured composable instance.
- **`describe('LIFECYCLE · maxRecords')`** — the suite; each `it` block covers one behavioral facet:
    - Wipe-before-store when a batch would exceed the cap (incoming batch always survives).
    - No wipe when the sum lands _exactly_ on the cap (boundary is strictly "past").
    - `maxRecords = 0` disables the bound entirely.
    - Wipe also drops the associated list cache, so a same-key re-fetch must hit the network.
    - Default value is 10 000.
    - A record under `watchTarget` is never evicted even past the cap.
    - Rows of a list under `watchAll` are never orphaned.
    - A record watched via an alternate key (alias) is likewise protected.
    - `fetchTarget` (single-record) calls enforce the cap one id at a time, not only list-shaped fetches.
- **`afterEach(clearAllInstances)`** — global teardown between tests.

## Relationships

- **`../_helpers/harness`** — provides `makeComposable`, `clearAllInstances`, and `flush`; the test builds all composable instances through it.
- **`../_helpers/fakeApi`** — provides `apiResolve`, a jest-mocked API response wrapper used to simulate fetches and to assert call counts (e.g., the orphaned-list re-fetch test).
- **`../_helpers/fixtures`** — provides `buildArticles(count, collection, startId)` and the `IArticle` type used as the generic parameter for the composable.

## Notes

- The wipe is all-or-nothing on the _other_ queries: when triggered, every other current-`dependsOn` entry (records **and** lists) is dropped; only the incoming batch and the crossing query itself survive (the crossing-query case lives in `maxRecords-crossing.spec.ts`).
- Watched entities (record, list rows, alias target) are **never evicted**, but they still count toward the cap—so the cap is a ceiling on total, not on evictable records.
- `maxRecords: 0` means "disabled," not "zero capacity."
- The single-record enforcement test relies on `gcTime: Infinity` to rule out time-based eviction as the mechanism under test.
