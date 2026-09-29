---
source: tests/structureRestApi/modifiers/partial.spec.ts
sha256: 3f2d33ff9c8a483efa9903efef7d6bb3d08045275609832dfb8e5bf9056753b4
generated_at: 2026-09-28T22:56:53.375576+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/modifiers/partial.spec.ts

## Purpose

Verifies that the `partial: true` modifier on list-fetch methods (`fetchAll`, `fetchByParent`) merges partial payloads into cached records instead of replacing them, and that it does **not** stamp records as "just fetched" — so new-to-cache records stay stale (a later `fetchTarget` still hits the API) while already-fresh records retain their freshness. Each partial case is paired with a default-behavior case to make the contrast explicit.

## Key elements

- **`describe('MODIFIER · partial')`** — top-level suite; runs `clearAllInstances()` in `afterEach`.
- **`describe('fetchAll seeding')`** — four tests covering: default seeding marks fresh (cache hit), partial merges immediately, partial leaves a new record stale (API hit), partial preserves existing freshness.
- **`describe('fetchByParent merge + seeding')`** — four tests covering: partial merges and preserves existing fields, default replaces (drops fields), partial leaves a new record stale, default seeds fresh.
- **`checkTarget(id)`** — composable method used to assert freshness state (`true` = fresh, `false` = stale) without triggering a fetch.
- **`getRecord(id)`** — composable method used to assert the merged/replaced record shape.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** — provides `makeComposable<IUser, number>()` (instantiates a throwaway composable for each test) and `clearAllInstances()` (teardown between tests).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — provides `apiResolve(value)`, which wraps a plain object into the mock API-response shape expected by composable fetch methods, returning a spy-able function.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — supplies `USERS` (array of full user objects), `FULL_USER` (a single fully-populated user), and the `IUser` type used for generic parameters.

## Notes

- The file header points to a **parallel spec** at `tests/structureSearchApi/modifiers/partial.spec.ts` for the same modifier on `fetchSearch`, and to `partial-invalidation.spec.ts` for the edge case of a partial fetch on an _invalidated_ (stale) record.
- Only `fetchAll` and `fetchByParent` are exercised here; `fetchPaginate` and `fetchSearch` are explicitly out of scope for this file (covered elsewhere per the header comment).
- The contrast pattern is consistent: every partial test has a sibling default test asserting the _opposite_ outcome (replace vs. merge, stale vs. fresh), so a regression in either direction is caught by the pair.
