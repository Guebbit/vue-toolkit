---
source: tests/internal/recordMutations.spec.ts
sha256: c38b669bfec3118653823122d86dbd6e47327ffbab95e39941b9112968334cfb
generated_at: 2026-09-28T22:41:37.741646+00:00
model: ollama:qwen3.8:27b
---

# tests/internal/recordMutations.spec.ts

## Purpose

Unit tests for `src/internal/recordMutations.ts`, verifying two contracts: which mutation kinds count as "changing record `id`" (`recordMutationsOf`) and the boundary rule for when a prior read may still write after a mutation (`canWrite`). Exists to pin down the exact classification of `update`/`delete` vs. `create`, graceful handling of missing `mutationKey`/`meta`, and the "exactly simultaneous" edge case.

## Key elements

- **`makeClient()`** — wraps `newTestClient()` (from the harness) and pushes the client into a module-level `clients` array; `afterEach` clears and drains them.
- **`runMutation(queryClient, options)`** — builds a mutation in the client's mutation cache with a trivial resolving `mutationFn` and executes it to completion; used to seed the cache in a known state.
- **`finishedUpdate(startedAt)`** — convenience that creates a client, runs a finished `['res','update','1']` mutation carrying `meta: { scope: [], startedAt }`, and returns the client.
- **`describe('recordMutations.recordMutationsOf')`** — table-driven test asserting `update`/`delete` mutations are counted, `create` is not, and a mutation with no `mutationKey` is silently skipped.
- **`describe('recordMutations.canWrite')`** — asserts the timing boundary: read `startedAt` equal to mutation `startedAt` blocks the write (`false`), earlier also blocks, later allows; also covers the no-`meta` case where scope is `undefined` and `startedAt` defaults to `0`.

## Relationships

- **`src/internal/recordMutations.ts`** — the module under test; imports `recordMutationsOf` and `canWrite`.
- **`tests/structureRestApi/_helpers/harness.ts`** — provides `newTestClient()`, the factory used by `makeClient` to build a fresh `QueryClient` for each test.

(`tests/package/smoke.mjs` appears in the dependency graph but is not imported or referenced by this file.)

## Notes

- `runMutation` always resolves with the string `'done'`; the tests never inspect the mutation result—only the side-effect of the mutation existing in the cache.
- The "no `meta`" test passes `undefined as unknown as unknown[]` as the scope argument to `canWrite` because a mutation without `meta` has no scope, and only an `undefined` scope matches it per the implementation contract.
- The `afterEach` cleanup uses `clients.splice(0)` (destructive drain) rather than `forEach`, so each client is cleared exactly once even if a test throws mid-loop.
