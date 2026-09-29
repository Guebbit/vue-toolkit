---
source: tests/structureSearchApi/intention/applied-search.spec.ts
sha256: edd5df491a77a0906f18c98e10caac782f80ece7e8b68de9ee4dc914f4f0a4c3
generated_at: 2026-09-28T23:08:55.119877+00:00
model: ollama:qwen3.8:27b
---

# tests/structureSearchApi/intention/applied-search.spec.ts

## Purpose

Intention tests that codify the behavioral contract of the search composable: the UI always reflects the **applied** search (the last resolved result), never the live filter state. The suite verifies that in-place filter edits trigger nothing, that `totalItems` and `pageItemList` persist across page/search transitions (flagged by `isPlaceholder`), and that cache fallbacks follow "most recently updated" semantics.

## Key elements

- **`IFilters`** — minimal `{ name?: string }` fixture shape used throughout.
- **`searchOperation()`** — returns a `jest.fn` that resolves one item per page, naming it after the `name` filter received; used to assert _which_ filters were applied.
- **`pageOf(id, totalItems)`** — returns a plain apiCall resolving a single-item page with a given total; used in the fake-clock describe block.
- **`anyContext`** — `expect.objectContaining({ signal: expect.any(AbortSignal) })` matcher for the trailing context argument every apiCall receives.
- **`describe('INTENTION · the applied search')`** — 7 tests covering: no refetch on in-place edit; `search()` applying new filters; total surviving a page change; `pageItemList` + `isPlaceholder` during page and search transitions; empty-first-load yielding `isPlaceholder === false`; keyed search isolation; and `search()` on a cached-fresh page settling through `onSuccess` without a network call.
- **`describe('INTENTION · the applied search, on a fake clock')`** — 2 tests verifying that the fallback total and placeholder come from the **most recently updated** cached page, not merely the last one cached.

## Relationships

- **`src/composables/structureSearchApi.ts`** — the module under test; this file imports the `ISearchResult` type and exercises the composable's public API (`watchSearch`, `fetchSearch`, `searchGet`, `pageCurrent`, `pageItemList`, `totalItems`, `isPlaceholder`, `pageTotal`).
- **`tests/structureSearchApi/_helpers/harness.ts`** — supplies `makeSearchComposable` (factory that wires the composable with a fake store), `clearAllInstances` (teardown), and `flush` (microtask pump).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — supplies `deferred`, a controllable Promise used to hold a fetch in-flight and resolve it on demand.
- **`tests/structureRestApi/_helpers/time.ts`** — supplies `useFakeClock`, `advance`, `restoreClock` for deterministic timing in the cache-staleness tests.

## Notes

- The "intention" naming signals these tests assert **contracts**, not implementation details; they are expected to be stable and to guide refactorings.
- `isPlaceholder` is the sole flag distinguishing "real current data" from "kept-on-screen previous data" during any transition (page change or new search). It is `false` on a genuinely empty first load because there is no prior data to show.
- The fake-clock tests distinguish _cache insertion order_ from _last-update recency_: re-fetching page 1 after page 2 makes page 1 the fallback even though page 2 was cached later.
- `search()` on a cached-fresh page must still invoke `onSuccess` (settling the watcher), even though no fetch occurs.
