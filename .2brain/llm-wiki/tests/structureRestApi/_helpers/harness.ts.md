---
source: tests/structureRestApi/_helpers/harness.ts
sha256: cff609004c42c91fce9682aa02bd80c9d22ed408a3d2cab56a52f7761e8487a5
generated_at: 2026-09-28T22:48:10.430237+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/_helpers/harness.ts

## Purpose

Test-harness module for the `structureRestApi` spec suite. It provides composable factories, a shared-instance registry, and a uniform teardown (`clearAllInstances`) so that Vue effect scopes, TanStack Query listeners, and injected query clients are deterministically torn down between tests. Every spec in this directory calls `afterEach(clearAllInstances)` to prevent cross-test leaks.

## Key elements

- **`track(instance, scope)`** – Registers an instance and its owning `EffectScope` in a module-level list; also calls `watchInside` to rebind the instance's `watch*` methods so they execute inside that scope.
- **`runTracked(factory)`** – Creates a fresh effect scope, runs `factory` inside it, and tracks the result.
- **`clearAllInstances()`** – Stops every tracked scope, calls `queryClient.clear()` on each tracked instance, then runs any registered teardown callbacks. Splices (not iterates) so it is safe to call repeatedly.
- **`newTestClient()`** – Returns a `QueryClient` configured with `retry: false` and `networkMode: 'always'` (Node has no real network detection; TanStack would otherwise pause every request).
- **`flush(rounds = 3)`** – Awaits `rounds` successive `setTimeout(0)` ticks to let Vue's scheduler, promise callbacks, and TanStack's batched notifications settle.
- **`DEFAULT_STALE_TIME`** – `3_600_000` (1 hour), matching the composable's own default.
- **`makeComposable(options?)`** – Builds `useStructureRestApi` with defaults (`resourceKey: 'resource'`, 1-hour staleTime, a fresh `newTestClient()` passed as an explicit option) inside its own effect scope, then tracks it. Accepts partial option overrides.
- **`makeShared(resourceKey?, staleTime?)`** – Creates two composables (`a`, `b`) that share a single `QueryClient` and `resourceKey`, plus a `make` factory for additional siblings.
- **`runInjected(queryClient, factory)`** – Creates a bare Vue app, installs `VueQueryPlugin`, and runs `factory` via `app.runWithContext` so `useQueryClient()` / `useIsFetching()` resolve through injection. Registers a teardown to `queryClient.unmount()` when not in SSR.
- **`makeInjected(queryClient, options?)`** – Convenience wrapper around `runInjected` that calls `useStructureRestApi` without an explicit `queryClient` option (relies on injection).
- **`watchInside(instance, scope)`** (internal) – Wraps every `watch*` method on the instance so its body executes inside the given scope; without this, watchers started outside a component's `setup()` would have no parent scope and leak past the test.

## Relationships

- **`src/composables/structureRestApi.ts`** – Imports `useStructureRestApi` and `IStructureRestApiOptions`; all factory functions here ultimately invoke that composable.
- **`tests/structureRestApi/effects/loading-per-method.spec.ts`**, **`loading-stability.spec.ts`**, **`intention/cross-method-cache.spec.ts`** – Direct consumers; import `makeComposable`, `makeShared`, `flush`, `clearAllInstances`, `newTestClient`, and friends.
- **`tests/structureCrudApi/core.spec.ts`**, **`filters.spec.ts`**, **`tests/isLoading.spec.ts`**, **`tests/internal/queryRecordStore.spec.ts`**, **`tests/internal/recordMutations.spec.ts`** – Also import from this harness (typically `runTracked`, `flush`, `clearAllInstances`).
- **`tests/browser/focus-online.spec.ts`**, **`gc.spec.ts`**, **`plugin.spec.ts`** – Exercise the `runInjected` / `makeInjected` injection path and the `queryClient.unmount()` teardown registered by `runInjected`.
- **`package.json`** – Declares the `vue` and `@tanstack/vue-query` packages this file imports at runtime.

## Notes

- The file is intentionally **not** named `*.spec.ts` so Jest's `testMatch` skips it; it is a helper, not a test.
- `makeComposable` passes `queryClient` as an **explicit option**; it does **not** use Vue injection. Use `makeInjected` when the spec needs to verify the `useQueryClient()` injection path.
- `runInjected` never mounts the app (`createApp` + `runWithContext` only). The teardown for the client is `queryClient.unmount()`, not `app.unmount()`.
- The `watchInside` rebind is necessary because specs start watchers _after_ setup, outside any active effect scope; without it, each watcher's child scope would have no parent to stop with and would leak.
- `clearAllInstances` must be called in `afterEach`; it is not auto-invoked.
