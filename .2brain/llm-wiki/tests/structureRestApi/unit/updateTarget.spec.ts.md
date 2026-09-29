---
source: tests/structureRestApi/unit/updateTarget.spec.ts
sha256: c388b9e062f4d360ddabbc82742e119552d7b50cdb90f32212b3a6f075114bf0
generated_at: 2026-09-28T23:06:27.127219+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/updateTarget.spec.ts

## Purpose

Unit tests for the `updateTarget` optimistic-update contract of the composable. Covers the happy path (apply + confirm), rollback semantics on rejection, concurrency with in-flight reads and deletes, freshness (staleness) guarantees around confirmed vs. unconfirmed writes, the mutation-key shape, and the empty-response edge case.

## Key elements

- **`make()` / `seedAlice(c)`** – local shorthands: instantiate a `makeComposable<IUser, number>()` and pre-load the `USERS` fixture.
- **`describe('UNIT · updateTarget')`** – main suite:
    - Apply + confirm; resolve with raw API response.
    - Rollback on rejection, including removal of fields the optimistic patch _added_ (full-snapshot restore, not a merge).
    - Late update response must not resurrect a record a concurrent `deleteTarget` already removed.
    - Post-settle, a forced re-read overwrites with the newer server value.
    - In-flight `fetchTarget` of the same id is cancelled; its (late) answer must not overwrite the optimistic edit.
    - **Freshness sub-suite** (uses fake clock, `staleTime = 10 000`):
        - Rollback preserves the record's pre-existing staleness.
        - A confirmed `applyResponse` write is always fresh.
        - `applyResponse: false` neither applies the server payload nor stamps freshness.
        - A read landing while the update is in flight does not stamp the unconfirmed patch fresh.
- **`describe('UNIT · updateTarget mutation key')`** – asserts a numeric id is stringified to match query keys (`['resource','update','1']`), so `whatIsSaving(id)` can filter correctly.
- **`describe('UNIT · updateTarget with an empty response')`** – server resolving to `undefined` keeps the optimistic patch intact.

## Relationships

- **`../_helpers/harness.ts`** – source of `makeComposable`, `clearAllInstances` (used in `afterEach`), and `flush` (microtask drain in concurrency tests).
- **`../_helpers/fakeApi.ts`** – provides `apiResolve`, `apiReject`, and `deferredApi` for mock responses and controllable in-flight promises.
- **`../_helpers/fixtures.ts`** – provides the `USERS` array and `IUser` type used as seed data and expected shapes.
- **`../_helpers/time.ts`** – provides `useFakeClock`, `advance`, `restoreClock` for the staleness/freshness sub-suite.

## Notes

- The "rollback of added fields" test is a guard against a regression where rollback was implemented as a shallow merge over the mutated record; it asserts a full snapshot replace.
- Concurrency tests depend on `flush()` to settle microtasks before asserting on query-cache state; omitting it makes assertions racy.
- `applyResponse: false` is a fourth optional argument to `updateTarget`; when set, the server's payload is discarded and the optimistic patch remains the source of truth.
- Freshness tests advance the clock _before_ calling `updateTarget` to ensure the record is genuinely expired at the moment the update starts, isolating the freshness stamping behavior from prior cache state.
