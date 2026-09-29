---
source: tests/structureCrudApi/core.spec.ts
sha256: c3f142289820aa98f67fcef21a348f6eff18e23ceace8c20a1ed86e42c9e2acf
generated_at: 2026-09-28T22:44:10.990722+00:00
model: ollama:qwen3.8:27b
---

# tests/structureCrudApi/core.spec.ts

## Purpose

Integration-style spec for the `useStructureCrudApi` composable. It verifies that the higher-level resource layer correctly delegates to (and preserves) the underlying search/REST API, manages filter state, honours caching semantics, resets to initial filters, and reports errors through callbacks rather than swallowing them.

## Key elements

- **`makeCrud(overrides?)`** — builds a fully spied composable (all six CRUD operations are `jest.fn()`) via `runTracked`, returning `{ api, operations }` so tests can assert both store state and the exact calls made. Accepts partial overrides to simulate specific behaviours (rejections, custom payloads).
- **`makeReadOnly()`** — builds a composable with only a `list` operation, used to confirm that absent operations reject with a message naming the missing operation.
- **`anyContext`** — `expect.objectContaining({ signal: expect.any(AbortSignal) })`, the expected trailing argument on every read call.
- **`IProduct`, `IProductFilters`, `IProductUpdate`** — minimal domain types used throughout the spec.
- **`describe` blocks** — organised by concern: pass-through members, filters (init, source-of-truth, non-reactive edit), `fetchList`, `watchList` (reactive re-search, `onError`, `pageItemList`, `totalItems`), `searchNow` (page reset, filter snapshot), `resetFilters` (restore to `initialFilters`, cache bypass, applied-vs-typed distinction), `fetchPage`.

## Relationships

- **`src/composables/structureCrudApi.ts`** — the module under test. The spec imports `useStructureCrudApi` and the `IStructureCrudOperations` type from it.
- **`tests/structureRestApi/_helpers/harness.ts`** — provides the test scaffolding: `runTracked` (wraps composable creation so watchers/scopes are torn down), `clearAllInstances` (called in `afterEach`), `flush` (drains microtask queues), and `newTestClient` (a fresh query client per instance).
- **`package.json`** — project-level configuration (Jest, Vue, and the monorepo tooling that makes the relative imports and `jest.fn()` globals available).

## Notes

- `staleTime` is set to `3_600_000` inside `makeCrud`; cache-related assertions (second `fetchList` not re-calling, `resetFilters` bypassing cache) depend on this value.
- `searchNow` captures filters at call time — a deliberate design choice the spec pins down ("sends the filters it applied, even when they are edited before the request goes out").
- The "does not search on its own when edited" test encodes the boundary: auto-search-on-keystroke is the _screen's_ responsibility, not the resource's.
- All composable instances are created inside `runTracked`; the `afterEach(clearAllInstances)` teardown prevents cross-test leakage of watchers.
