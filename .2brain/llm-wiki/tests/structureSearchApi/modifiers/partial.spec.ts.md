---
source: tests/structureSearchApi/modifiers/partial.spec.ts
sha256: f097ecdf4cbc9d97f5aed2b93817a69ad4264c960f802a7a8044dcd350403712
generated_at: 2026-09-28T23:11:04.030302+00:00
model: ollama:qwen3.8:27b
---

# tests/structureSearchApi/modifiers/partial.spec.ts

## Purpose

Tests the `partial` modifier on `fetchSearch`, verifying that partial search results are written into the target cache's records immediately but do **not** mark those records as freshly fetched. This ensures a subsequent `fetchTarget(id)` for a record that was only seen via a partial search still issues a real API call, preserving the invariant that only authoritative fetches stamp freshness.

## Key elements

- **`describe('MODIFIER · partial')`** — top-level suite isolating the partial-modifier contract.
- **`describe('fetchSearch seeding')`** — inner suite covering the three behavioral cases:
    - _Default (no `partial`)_: seeds the cache fresh; a later `fetchTarget` is a no-op cache hit.
    - _`partial: true` – immediate visibility_: `getRecord(id)` returns the partial item right away.
    - _`partial: true` – staleness preserved_: a record new to the cache remains stale; a later `fetchTarget` hits the API exactly once.
- **`make()`** — thin factory calling `makeSearchComposable<IArticle, number>()` for a clean instance per test.
- **`afterEach(clearAllInstances)`** — tears down all composable instances between tests.

## Relationships

- **`tests/structureSearchApi/_helpers/harness.ts`** — provides `makeSearchComposable` (the SUT factory) and `clearAllInstances` (lifecycle cleanup).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — provides `apiResolve`, which wraps a payload in a call-counting mock response used as the `apiResponse` argument to `fetchSearch` / `fetchTarget`.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — provides `buildArticles` (fabricates `IArticle` items) and the `IArticle` type used as the generic parameter for the composable.

## Notes

- The partial contract mirrors the one tested in `tests/structureRestApi/modifiers/partial.spec.ts` for the REST list-query path; both suites must stay in lockstep if the freshness semantics change.
- "Partial" does **not** mean the value is absent from the record — it means the value is present _without_ a freshness stamp. This is the single non-obvious behavior the suite guards.
- `apiResolve` doubles as both the mock response and the call spy (`get` is called via `toHaveBeenCalledTimes` / `not.toHaveBeenCalled`), so the same object serves as data source and assertion target.
