---
source: tests/structureRestApi/lifecycle/noScopeWarning.spec.ts
sha256: a6e01e6ce208a94ef74aa08aea1fee7540d323037a4db531c799a0015b7e0dd6
generated_at: 2026-09-28T22:54:06.037599+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/lifecycle/noScopeWarning.spec.ts

## Purpose

Verifies the lifecycle contract that `useStructureRestApi` must emit a single `console.warn` (deduped per `resourceKey`) when instantiated outside an active effect scope, and must stay silent when instantiated inside one. The warning exists because, without a scope, the resource's `onScopeDispose` subscriptions (activity tracking, registry claim) are never torn down and leak for the QueryClient's lifetime with no caller-facing handle.

## Key elements

- **`buildUnscoped(resourceKey)`** – Local helper that calls `useStructureRestApi` with a fresh test client, tracking it against an _empty_ `effectScope()`. The empty scope simulates "no active scope" while still giving `clearAllInstances` a client reference to clean up.
- **`describe('LIFECYCLE · building a resource outside an effect scope')`** – Two specs:
    - _warns once naming the resourceKey, and not again for the same key_ – Spies on `console.warn`; asserts exactly one call for `leaky-a`, no second call for a repeat of the same key, and a fresh call for `leaky-b`.
    - _does not warn when built inside an effect scope_ – Uses the harness `runTracked` (which provides a real active scope) and asserts `console.warn` is never called.
- **`afterEach`** – Calls `clearAllInstances()` and `jest.restoreAllMocks()` to reset client instances and the `console.warn` spy regardless of assertion outcome.

## Relationships

- **`src/composables/structureRestApi.ts`** – The module under test. This spec imports `useStructureRestApi` and exercises its no-scope code path.
- **`tests/structureRestApi/_helpers/harness.ts`** – Supplies the test utilities used throughout: `clearAllInstances`, `newTestClient`, `runTracked`, and `track`.
- **`package.json`** – Provides the `vue` dependency (`effectScope`) and the Jest test runner.

## Notes

- `buildUnscoped` intentionally passes an **empty** `effectScope()` rather than omitting a scope entirely. This lets the harness's `clearAllInstances` still reach the client, while ensuring the resource's `onScopeDispose` registrations have no active scope to fire against—exactly the leaky condition under test.
- The `afterEach` calls `jest.restoreAllMocks()` unconditionally; the comment notes this matters even when a `expect` assertion throws, so the `console.warn` spy doesn't persist into the next spec.
- Deduplication is per `resourceKey`, not per call site or per component instance. Two different keys each warn once.
