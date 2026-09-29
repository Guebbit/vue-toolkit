---
source: tests/structureRestApi/modifiers/merge.spec.ts
sha256: a15a6fdf55094bfd41d9f6a63f824830f9c24b695c7c5a9037fef8ea98a31468
generated_at: 2026-09-28T22:56:22.297887+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/modifiers/merge.spec.ts

## Purpose

Verifies the `merge` modifier on the structure REST API composable. When `merge: true` is supplied, the stored record should be _enriched_ (fields absent from the server response are kept) rather than _replaced_. The spec exercises this contract across all four data-mutating operations: `fetchAll`, `fetchTarget`, `fetchByParent`, and `updateTarget`, and contrasts each with the default (non-merge) replace behavior.

## Key elements

- **`make()`** — local factory wrapping `makeComposable<IUser, number>()` so every test starts from a fresh instance.
- **`afterEach(clearAllInstances)`** — global teardown that resets all composable instances between tests.
- **`describe('fetchAll')`** — two tests: default drops absent fields; `merge: true` preserves them.
- **`describe('fetchTarget')`** — two tests: merge enriches a summary record into a full one; and a guard test asserting that merging a _new_ record does **not** set `lastInsertedIdentifier` (prevents a fetch from being mistaken for an insert).
- **`describe('fetchByParent')`** — one test: merge keeps existing fields while still registering the record under the parent list.
- **`describe('updateTarget')`** — two tests: merge merges the server response into the stored record; default replaces it entirely.

## Relationships

- **`_helpers/harness.ts`** — supplies `makeComposable` (the composable under test) and `clearAllInstances` (used in `afterEach`).
- **`_helpers/fakeApi.ts`** — supplies `apiResolve`, which wraps plain objects into a resolvable API-shape so the composable's fetch/mutation paths execute synchronously in tests.
- **`_helpers/fixtures.ts`** — supplies `FULL_USER` (a complete `IUser` record used as the "rich" baseline) and the `IUser` type that parameterizes the composable.

## Notes

- Most tests pass `forced: true` to bypass any cache/already-fetched short-circuit; the one `fetchTarget` guard test intentionally omits it to exercise the cold-cache path.
- The `lastInsertedIdentifier` guard test exists because `editRecord`'s `isNew=true` branch could otherwise be indistinguishable from a true insert — a subtle correctness concern for consumers that track inserts.
- `fetchByParent` test also asserts `getListByParent('team-1')` length, confirming merge does not disrupt the parent-index bookkeeping.
