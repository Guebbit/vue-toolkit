---
source: tests/internal/resourceActivity.spec.ts
sha256: 9d91a8edf36822dce82fc657c15620ddb51cf942f9d28b41d0021b8e3136f24f
generated_at: 2026-09-28T22:41:52.019807+00:00
model: ollama:qwen3.8:27b
---

# tests/internal/resourceActivity.spec.ts

## Purpose

Unit tests for `useResourceActivity`, verifying that the data counter and status-counter computed re-evaluate only for events belonging to their own resource key (including hydration) and stop reacting once the owning `EffectScope` is disposed.

## Key elements

- **`describe('UNIT · useResourceActivity')`** — Top-level suite; one `QueryClient` and one `effectScope` per test.
- **`startMutation(mutationKey?)`** (local helper) — Builds a mutation in the QueryClient's mutation cache whose `mutationFn` resolves a `Promise.withResolvers` gate that is only released in `afterEach`, keeping the mutation perpetually pending during the test body.
- **`evaluations` / `watched`** — A `computed` wrapping `activity.isLoading()` that increments a counter on every re-evaluation; used to assert whether the status reader was triggered.
- **Tests 5.1 – 5.7** — Cover: hydrate bumps data counter; empty query does not; `removeQueries` bumps; cross-resource isolation (data counter _and_ status evaluations); mutation of own vs. other resourceKey; scope disposal halts both subscriptions; `isSaving(id)` respects resource-key + ID matching.
- **Unnumbered tests** — "a data write bumps its own kind and no other" and "a query of this resource re-evaluates the status readers" pin down the exact counter arithmetic and that evaluations equal 1 (no bump) vs 2 (one bump).

## Relationships

- **`src/internal/resourceActivity.ts`** — The module under test; `useResourceActivity(queryClient, resourceKey, idAccessor)` is the sole imported symbol whose returned object (`activity`) is exercised by every assertion.
- **`package.json`** — Supplies the test runner (Vitest globals `describe`, `it`, `beforeEach`, `afterEach`, `expect`) and the `vue` / `@tanstack/vue-query` packages imported here.

## Notes

- The `resourceKey` string used in every test is `'items'`; the ID accessor is the identity function `(id) => id`. Tests for other resources intentionally use `'other'` as the first key element to prove isolation.
- `watched` is a `computed`, not a `watch`; it only re-evaluates when its reactive dependency (`activity.isLoading()`) actually changes value, not on every mutation. The `evaluations` counter therefore tracks _value transitions_, not raw event counts.
- `startMutation` pushes its resolver into `pending`; `afterEach` drains and resolves them so no test hangs on an unresolved Promise.
- Test numbering (5.1–5.7) is a project-wide spec convention; unnumbered tests are supplementary assertions that pair with a numbered one.
