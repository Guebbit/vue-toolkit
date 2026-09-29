---
source: tests/structureRestApi/modifiers/merge-target.spec.ts
sha256: bf9136a73afd2b5c0317810c0afeb9057432564bed5404dc0301dc0da64c6aec
generated_at: 2026-09-28T22:56:07.580464+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/modifiers/merge-target.spec.ts

## Purpose

Verifies that the `merge: true` modifier on record-target queries (`fetchTarget`, `watchTarget`) merges a partial API response into the existing stored record instead of replacing it. It also confirms the default (no-merge) behavior is a full replacement. The critical invariant under test: the query's resolved value must be the _merged_ record, because TanStack writes that value back under the same key — resolving with the raw response would silently undo the merge.

## Key elements

- **`PARTIAL_RESPONSE`** — a minimal `IUser` (`{ id, name }`) that is a strict subset of `FULL_USER`; used to trigger the observable difference between merge and replace.
- **`describe('MODIFIER · merge on a record query')`** — three tests:
    - _fetchTarget keeps the fields the response lacks_ — seeds a full record, then re-fetches with `merge: true, forced: true`; asserts both the store and the returned value contain the merged object.
    - _watchTarget keeps the fields the response lacks_ — same assertion via the reactive `watchTarget` path (no `forced` needed).
    - _without merge, the response replaces the record_ — negative control: without `merge`, the partial response overwrites the full record.
- **`afterEach(clearAllInstances)`** — resets all composable instances between tests for isolation.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** — provides `makeComposable` (creates a fresh composable instance), `clearAllInstances`, and `flush` (drives microtask/promise resolution for async assertions).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — provides `apiResolve(value)`, a helper that wraps a plain value in a resolved-API-response shape so it can be passed where a `Promise`-returning fetch function is expected.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — provides the `FULL_USER` fixture (a multi-field `IUser`) and the `IUser` type.
- **`package.json`** — supplies the test runner (Jest/Vitest) and Vue reactivity (`ref`) used in the `watchTarget` test.

## Notes

- The merge is only _observable_ when the incoming response is a **subset** of the stored record. A response that is a superset (or identical) looks the same whether merge is on or off, so those cases don't exercise the logic here.
- `forced: true` is required on the `fetchTarget` tests to bypass staleness/freshness gating and force a real re-fetch; `watchTarget` has no such gate.
- The file imports `ref` directly from `vue` for the reactive target in the `watchTarget` test — the composable expects a Vue ref, not a plain value.
