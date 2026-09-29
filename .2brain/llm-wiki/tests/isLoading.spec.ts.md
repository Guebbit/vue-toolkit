---
source: tests/isLoading.spec.ts
sha256: 24704e71d77e7a07c9160d2c311771b602ba1f77c2657e6cd4fe0d89d0e468ee
generated_at: 2026-09-28T22:42:36.273270+00:00
model: ollama:qwen3.8:27b
---

# tests/isLoading.spec.ts

## Purpose

Unit tests for the `useIsLoading` composable. Verifies that it reports whether _any_ resource whose `resourceKey` starts with one of the supplied prefixes is currently fetching or mutating, covers edge cases (non-string key segments, no prefixes, multiple prefixes, unrelated resources), and confirms that the underlying subscriptions are cleaned up when the component scope stops.

## Key elements

- **`setup(resourceKeys, prefixes?)`** – Local helper. Creates a fresh `QueryClient` via `newTestClient`, then uses `runInjected` to instantiate one `useStructureRestApi` per key and a single `useIsLoading(prefixes)` call, returning all three.
- **`describe('useIsLoading')`** – Eight test cases:
    - Prefix match true→false across a fetch lifecycle.
    - Non-matching resource stays `false` even while fetching.
    - No prefixes → matches _any_ resource on the shared client.
    - Mutations of a matching resource are counted.
    - Mutations of a non-matching resource are not.
    - Multiple prefixes: a resource matches if its key starts with _any_ one.
    - A foreign query whose first key segment is not a string is skipped without throwing, while a real matching resource is still detected.
    - Explicit `queryClient` argument (no injection context) works.
    - After `effectScope().stop()`, a subsequent fetch is invisible to `isLoading` (no leaked subscriptions).
- **`afterEach(clearAllInstances)`** – Tears down all toolkit instances between tests.

## Relationships

- **`src/composables/isLoading.ts`** – The composable under test; its `useIsLoading` export is imported and exercised in every case.
- **`src/composables/structureRestApi.ts`** – Provides `useStructureRestApi`, used to create the resource instances whose fetch/mutate calls drive the loading state.
- **`tests/structureRestApi/_helpers/harness.ts`** – Supplies `newTestClient`, `runInjected`, `runTracked`, `flush`, and `clearAllInstances`; the entire suite depends on these for setup, microtask draining, and cleanup.
- **`tests/structureRestApi/_helpers/fakeApi.ts`** – Supplies `deferredApi`, the controllable Promise factory used to hold queries/mutations in-flight and resolve them deterministically.
- **`package.json`** – Defines the Vitest runner, module resolution, and project scripts that execute this file.

## Notes

- The test file lives in `tests/` but imports helpers from `tests/structureRestApi/_helpers/`, creating a cross-suite dependency. Adding or removing those helpers affects both suites.
- Prefix matching is a **string `startsWith`** rule on the first segment of the query key; it is intentionally the same rule `useCoreStore.isLoading` uses. Tests with a non-string first segment (e.g. `{ notAResourceKey: true }`) exist specifically to guard against a `TypeError` being thrown during the prefix check.
- The "explicit client" test (`runTracked` + `queryClient` passed as second argument) is the only case that does **not** use `runInjected`; it exists to prove `useIsLoading` does not _require_ injection.
- The scope-stop test uses `effectScope()` directly rather than a Vue component, so the composable's `onScopeDispose` cleanup path is exercised without a full app mount.
