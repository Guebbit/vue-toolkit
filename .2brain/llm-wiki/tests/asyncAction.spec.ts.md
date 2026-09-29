---
source: tests/asyncAction.spec.ts
sha256: de4a8fcdb955d3d5ec582552e5cd0ca79af8b8719622674964da55d6e8158511
generated_at: 2026-09-28T22:39:05.398769+00:00
model: ollama:qwen3.8:27b
---

# tests/asyncAction.spec.ts

## Purpose

Test suite for the `useAsyncAction` composable. It locks down the reactive state contract (data, error, loading), the never-reject / never-throw failure guarantee, race-condition safety on overlapping calls, the `resolveError` injection point for i18n, and the `reset` escape hatch.

## Key elements

- **`deferred<T>()`** – local helper wrapping `Promise.withResolvers<T>()` so tests can resolve or reject a promise by hand to interleave two concurrent `run()` calls.
- **`describe('initial state')`** – asserts the idle defaults (`undefined` data/error, `loading: false`) and that the `initialData` option seeds `data`.
- **`describe('run')`** – verifies the resolved payload is stored in `data`, `loading` toggles correctly, and extra arguments are forwarded to the underlying action.
- **`describe('failure')`** – the largest group. Confirms `run()` never rejects or throws (even when the action throws synchronously before returning a promise), extracts messages from `Error` instances, plain HTTP-envelope objects, bare strings, and falls back to `fallbackErrorMessage`. Also asserts that a later successful run clears a prior error, and that a later failure preserves the last good `data` value.
- **`describe('resolveError')`** – exercises the injected `resolveError` callback: it receives the raw error and the per-call fallback string, and its return value (e.g. an Italian string) becomes `error.value`. Without it, an unreadable rejection yields `''` rather than any hardcoded English text.
- **`describe('overlapping runs')`** – uses the `deferred` helper to resolve two concurrent calls out of order; asserts that a stale response or stale failure is discarded, and that `loading` stays `true` until the _newest_ call settles.
- **`describe('reset')`** – confirms `reset()` restores `initialData`, clears error/loading, and that an in-flight promise resolved after `reset()` does not write back into state.

## Relationships

- **`src/composables/asyncAction.ts`** – the sole import. Every test instantiates `useAsyncAction` with a mock action and asserts on the returned reactive handles (`data`, `error`, `loading`, `run`, `reset`). No other project files are touched.

## Notes

- The test runner is **Jest** (`jest.fn`, `describe/it/expect`); the `deferred` helper relies on `Promise.withResolvers`, a very recent ES feature—ensure the TS/lib target supports it.
- Several tests encode a deliberate product decision in comments: stale data is preferred over an empty panel ("Better a stale panel with an error beside it than an empty one"), and the composable must never produce its own English error copy (i18n is the app's job via `resolveError`).
- The "never throws" test is distinct from "never rejects": it guards against the action throwing synchronously _before_ a promise is returned, which would otherwise bypass the `.catch` path.
