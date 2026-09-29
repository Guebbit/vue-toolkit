---
source: tests/structureSearchApi/_helpers/harness.ts
sha256: be783fa175bfc8e0aabe8111e7bf53f2efab688e380a755050dfbb9308432775
generated_at: 2026-09-28T23:08:06.025063+00:00
model: ollama:qwen3.8:27b
---

# tests/structureSearchApi/_helpers/harness.ts

## Purpose

Test helper for the `structureSearchApi` spec suite. Provides `makeSearchComposable`, a factory that builds a tracked `useStructureSearchApi()` instance (with its own internal `restApi` and `QueryClient`) bound to a mutable `filters` ref so tests can mutate filters mid-run. Re-exports the tracking/cleanup utilities from the `structureRestApi` harness so the search specs get the same Jest-exit hygiene for free.

## Key elements

- **`makeSearchComposable<T, K, F>(restApiOptions?, initialFilters?)`** — Creates an `effectScope`, runs `useStructureSearchApi` inside it (so the inner `restApi`'s `onScopeDispose` subscriptions get registered), wraps the result with `track(scope, …)`, and returns `{ searchApi, filters }` where `filters` is a plain `ref`. `restApiOptions` lets tests override the internal restApi config (e.g. `{ staleTime: 0 }`, `{ resourceKey: 'orders' }`); `initialFilters` seeds the ref.
- **Re-exports** — `clearAllInstances`, `flush`, `newTestClient`, `runTracked`, `track`, `DEFAULT_STALE_TIME` — all forwarded from `../../structureRestApi/_helpers/harness`. Spec files import everything they need from this single module.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** — Source of all re-exported utilities (`track`, `clearAllInstances`, `newTestClient`, `flush`, `runTracked`, `DEFAULT_STALE_TIME`). This file delegates all tracking/cleanup logic there.
- **`src/composables/structureSearchApi.ts`** — The composable under test; `makeSearchComposable` calls `useStructureSearchApi` directly.
- **`src/composables/structureRestApi.ts`** — Type-only import of `IStructureRestApiOptions` for the `restApiOptions` parameter.
- **All spec files in `tests/structureSearchApi/`** (core, intention/_, lifecycle/_, modifiers/*) — Import `makeSearchComposable` and the re-exported helpers from this module rather than reaching into the REST harness directly.

## Notes

- The file is deliberately **not** named `*.spec.ts`; Jest's `testMatch` skips it so it's never collected as a test file.
- `queryClient` is passed explicitly via `newTestClient()` rather than relying on `useQueryClient()` injection, because the test has no Vue app/component tree to provide through.
- The `effectScope` is essential: without an active scope, the inner `restApi`'s cache subscriptions (registered via `onScopeDispose`) would never be torn down, leaking state between tests.
- Generic defaults (`T = Record<string, any>`, `K = Extract<…>`, `F = object`) let simple specs call `makeSearchComposable()` with no type arguments while still allowing full type-safety in stricter tests.
