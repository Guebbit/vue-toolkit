---
source: tests/structureRestApi/unit/watchers.spec.ts
sha256: ae982b0a75f85c05d71b9a82f1349424f26528e09a8579c8b160041f7477a246
generated_at: 2026-09-28T23:07:50.964506+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/watchers.spec.ts

## Purpose

Unit test suite that pins the **shared contract** of the four watcher methods (`watchTarget`, `watchAll`, `watchByParent`, `watchAny`) exposed by the structure composable. It verifies the handle shape (`{ stop, refetch, suspense, error }`), that failures land in `error` rather than as rejections, that settle callbacks fire on cache hits as well as after fetches, and that no fetch occurs without an id. The `suspense()` section additionally locks down SSR-friendly resolution semantics (resolve immediately on a disabled/id-less watcher instead of hanging).

## Key elements

- **`describe('UNIT · watchTarget')`** – Refetch with/without an id, `onSuccess` on a cached id switch, failed-fetch error state, and settle-callback dispatch ordering (must run after the cache event finishes, via `queueMicrotask`).
- **`describe('UNIT · watchAll / watchByParent')`** – `watchAll` failure surfaces in `error` while `refetch()` still resolves; `watchByParent` tracks a reactive parent id and stores per-parent lists.
- **`describe('UNIT · watchAny')`** – Independent query keys stay isolated, `refetch()` resolves stored data, and `stop()` prevents later invalidations from triggering a fetch.
- **`describe('UNIT · suspense()')`** – All four watchers resolve `suspense()` with their data; id-less or `enabled: false` watchers resolve immediately (undefined) without fetching; a fresh cache hit settles `suspense()` without re-fetching.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** – Provides `makeComposable` (instantiates the SUT), `clearAllInstances` (teardown in `afterEach`), and `flush` (microtask drain between state changes).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** – Supplies `apiReject`, `apiResolve`, and `apiVersioned` to simulate success/failure/versioned responses without a network.
- **`tests/structureRestApi/_helpers/fixtures.ts`** – Exports the `USERS` array and the `IUser` type used as the generic data shape throughout the tests.
- **`package.json`** – Declares Jest, Vue, and other runtime/dev dependencies the test imports.

## Notes

- The file's header comment is the **normative spec** for the watcher contract; treat it as the source of truth when adding new watcher methods.
- `suspense()` on a disabled/id-less watcher is a **deliberate divergence** from TanStack Query's built-in `suspense()` (which would never resolve until `enabled` flips to `true`). Any refactor must preserve this.
- Settle callbacks (`onSuccess`, `onError`, `onSettled`) are dispatched via `queueMicrotask` (see `settleCallbacks.ts`); the ordering test in the `watchTarget` block exists to catch a regression where they run synchronously inside the cache-event dispatch and corrupt query state.
- `ref<number | null>(null)` cases carry `eslint-disable unicorn/no-null` comments—these are intentional, not lint debt.
