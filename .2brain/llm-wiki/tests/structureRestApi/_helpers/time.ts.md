---
source: tests/structureRestApi/_helpers/time.ts
sha256: 485dd1a721d3654f3cf560271e20fbd1610480a6d3399fec25a05b4e5b7b072e
generated_at: 2026-09-28T22:48:29.028877+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/_helpers/time.ts

## Purpose

A small fake-clock utility module for the `structureRestApi` staleTime and concurrency test suites. It wraps Jest's timer APIs with a fixed base timestamp and an async-advance helper so that specs can deterministically travel past `staleTime` windows without flakiness. It lives in `_helpers/` (not a `*.spec.ts`) so Jest's `testMatch` pattern skips it.

## Key elements

- **`BASE_NOW`** – A fixed epoch (`2026-01-01T00:00:00.000Z`) used as the default "now" for fake timers, keeping `dataUpdatedAt` arithmetic stable across runs.
- **`useFakeClock(now?)`** – Calls `jest.useFakeTimers({ now })`; intended for `beforeEach`.
- **`advance(ms)`** – Awaits `jest.advanceTimersByTimeAsync(ms)`, which also flushes pending microtasks (e.g. resolved `apiCall` promise chains). Use after the initial fetch to push the clock past the stale window.
- **`restoreClock()`** – Calls `jest.useRealTimers()`; intended for `afterEach` (paired with `clearAllInstances()`).

## Relationships

- **`tests/structureRestApi/staleTime/*.spec.ts`** (check, get, multiple, mutations, search) – Primary consumers. Each spec's `describe` block calls `useFakeClock` in `beforeEach`, `advance` to cross the stale window, and `restoreClock` in `afterEach`.
- **`tests/structureRestApi/unit/updateTarget.spec.ts`** – Also imports these helpers for timing-sensitive assertions.
- **`tests/structureSearchApi/staleTime/*.spec.ts`**, **`tests/structureSearchApi/search/search.latestPage.spec.ts`**, **`tests/structureSearchApi/intention/*.spec.ts`** – Analogous specs in the sibling `structureSearchApi` directory; they follow the same fake-clock pattern (each likely has its own local copy of this helper).
- **`tests/browser/gc.spec.ts`** – Shares the same "advance past a TTL" testing pattern at the browser layer.

## Notes

- `advance` is async and must be `await`ed; it uses `advanceTimersByTimeAsync` specifically so that microtask queues (resolved API call chains) drain between timer steps. Synchronous `advanceTimersByTime` would skip those microtasks.
- For zero-latency (immediate) API calls, `advance` is unnecessary — simply `await` the fetch promise.
- The `BASE_NOW` constant is far in the future relative to typical `Date.now()` values; this is intentional so that `staleTime` arithmetic doesn't accidentally cross a boundary depending on when the test runs.
- The file is a plain module with no side effects on import; all Jest state is mutated only when the exported functions are called.
