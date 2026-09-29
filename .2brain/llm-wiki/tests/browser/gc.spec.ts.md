---
source: tests/browser/gc.spec.ts
sha256: 985b768ec0ae0e6e2d4f78fdb5609213ffd6b020fb9280f1695840d035f1e8aa
generated_at: 2026-09-28T22:39:45.042004+00:00
model: ollama:qwen3.8:27b
---

# tests/browser/gc.spec.ts

## Purpose

Verifies the **browser** garbage-collection path of the resource cache. TanStack Query reads `typeof window === 'undefined'` once at import time to pick its default `gcTime` (5 min in browser vs. `Infinity` in Node). This file confirms that under jsdom, the three explicitly-`Infinity` query kinds (`target`, `parent`, `search`) survive unwatched past 5 minutes, while the non-overridden kinds (`all`, `any`) are collected, and that an active watcher prevents collection.

## Key elements

- **`describe('BROWSER · garbage collection')`** — six `it` blocks covering:
    - `target` record survives 5 min unwatched
    - `parent` (belongsTo) list survives 5 min unwatched
    - `search` page (`pageItemList` / `totalItems`) survives 5 min unwatched
    - `all` entry is **collected** after 5 min (individual records with `Infinity` are unaffected)
    - `any` entry is **collected** after 5 min
    - An **active** `watchAll` subscriber keeps the `all` entry alive past 5 min
- **`FIVE_MINUTES`** — `5 * 60 * 1000`, the ms threshold matching TanStack's browser default.
- **`beforeEach` / `afterEach`** — installs fake clock, clears all composable instances, restores clock.
- **Stryker jsdom wrapper** — the `@jest-environment` pragma at the top selects `@stryker-mutator/jest-runner/jest-env/jsdom` so mutation testing instruments coverage correctly.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** — provides `makeComposable` and `clearAllInstances`, the primary composable factory and teardown.
- **`tests/structureSearchApi/_helpers/harness.ts`** — provides `makeSearchComposable` for the search-page test.
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — `apiResolve` wraps a value in a resolved promise to simulate a network response.
- **`tests/structureRestApi/_helpers/time.ts`** — `useFakeClock`, `advance`, `restoreClock` drive deterministic timer-based GC assertions.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — `USERS` array and `IUser` type used as the fixture payload across all tests.
- **`docs/guide/testing.md`** — documents the browser-vs-node testing split and the jsdom/Stryker setup used here.

## Notes

- **Node-environment blind spot:** Under plain Jest (Node), `typeof window` is undefined so TanStack defaults `gcTime` to `Infinity` for _all_ queries, making the explicit `Infinity` on `target`/`parent`/`search` unobservable. This file is the _only_ place that exercises the real 5-minute default path.
- **`await advance(0)` in the watcher test:** With fake timers active, `flush()` (which awaits real timers) would hang; a zero-advance tick is sufficient to let microtasks settle.
- **Query-key shape:** Assertions use the raw key arrays (e.g. `['resource','target',[],'1']`) to inspect the cache directly rather than going through the composable's public API, so the test verifies _cache-level_ GC, not just visible state.
