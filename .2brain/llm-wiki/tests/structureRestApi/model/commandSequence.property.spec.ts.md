---
source: tests/structureRestApi/model/commandSequence.property.spec.ts
sha256: 44a9fe5c24077cdbf9c62f0ff4b12b55ee611cfa7fad0f177b7aa4237d91a7dd
generated_at: 2026-09-28T22:55:24.902377+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/model/commandSequence.property.spec.ts

## Purpose

Property-based test that generates random sequences of up to 15 API commands (reads, mutations, resets, scope switches) and asserts a set of cache/integrity invariants hold after every sequence settles. Settlement order is controlled by `fast-check`'s `fc.scheduler` rather than real timers, generalising the hand-written race specs (`lateWrite`, `lateRollback`, `dependsOn`) into many generated interleavings.

## Key elements

- **`TCommand`** — discriminated union of 9 command kinds: `fetchTarget`, `fetchAll`, `fetchMultiple`, `createTarget`, `updateTarget`, `deleteTarget`, `resetRecords`, `resetAll`, `switchDependsOn`. Each carries a `fail` flag (except resets/switch) and kind-specific fields.
- **`commandArbitrary`** — `fc.Arbitrary<TCommand>` built from `fc.oneof` over `fc.record` descriptors; draws ids from `existingId` (1–6) or `creatableId` (10–13) and `ids` arrays (max length 4) for `fetchMultiple`.
- **`scheduleCall`** (internal helper, not exported) — wraps each API call so the real server mutation is deferred until the scheduler releases that task, making release-order (not issue-order) decide what each call observes.
- **Invariant block** (inside the `it` callback) — after `scheduler.waitAll()` + `flush()`, five invariants are checked: (1) settlement/rejection correctness, (2) no lingering `isLoading`, (3) `maxRecords` upper and exact bounds (pure-reads epochs only), (4) no illegitimate cached ids, (5) no missing landed ids (with broad exclusion for same-id races, abandoned-epoch mutations, and evictable ids).
- **`FC_NUM_RUNS`** — env-var-controlled run count, default **25** (lower than the project-wide default of 50); raise it locally (e.g. `FC_NUM_RUNS=500 npx jest model`) when hunting rare interleavings.
- **`ID_SPACE`** — flat array `[1,2,3,4,5,6,10,11,12,13]` used for `fetchAll`'s broad `allTouches` bump.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** — provides `makeComposable` (builds a fresh composable + scope per generated case), `clearAllInstances` (used in `afterEach`), and `flush` (drains microtasks before assertions).
- **`tests/structureRestApi/_helpers/fakeServer.ts`** — provides `createServer<IUser>`; the test relies on its eager-mutation behaviour and works around it via `scheduleCall`.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — provides `buildUsers(4)` (seed data for the fake server) and the `IUser` type.
- **`package.json`** — source of the `fast-check`, `vue`, and `jest` dependencies this file imports.

## Notes

- **Why not `fc.commands` / `asyncModelRun`?** The model is simple enough (a couple of `Set`s keyed by scope generation) that `fc.array` + `fc.scheduler` is sufficient with less ceremony; the scheduler still controls the actual settlement timing.
- **Assertions are deferred.** `scheduler.waitOne()` resolves only the scheduled promise itself, not downstream engine effects (write-guard `.finally`, TanStack batched notifications). All invariant checks run only after `waitAll()` + `flush()` have fully drained.
- **`createTarget` ids are pre-assigned (10–13)** because the server auto-assigns otherwise, and the model must know the id before the call settles.
- **`fetchTarget` is tracked broadly in invariants 4/5** even though it is individually safe (its own query is cancelled by `targetQueryFunction`). The broad tracking only ever _excludes_ an id from the strict check; it can widen unverified surface but never produce a false failure.
- **`mutatedInEpochs`** is keyed by `resetEpoch` (bumped by both reset and switch), not by scope directly, since distinguishing the two would only ever narrow which ids get the strict check without fixing any false failure.
