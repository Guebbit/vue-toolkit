---
source: src/internal/scopeRegistry.ts
sha256: 9b8a09b541945e8b553983f194a4cb6a1c20e4873ba90fda4a4f8834177b0649
generated_at: 2026-09-28T22:37:18.353279+00:00
model: ollama:qwen3.8:27b
---

# src/internal/scopeRegistry.ts

## Purpose

Tracks which `dependsOn` scope snapshots are still "live" (claimed by at least one active resource instance) for each `(QueryClient, resourceKey)` pair. Without this registry, two simultaneous instances of the same resource (e.g. side-by-side comparison panels) could each mistake the other's scope for abandoned and invalidate its data during start-up sweeps or `dependsOn` switches.

## Key elements

- **`registries`** (module-private) — `WeakMap<QueryClient, Map<string, Map<string, number>>>` holding scope→count maps, lazily created per resource key.
- **`countsFor(queryClient, resourceKey)`** (private helper) — retrieves or creates the scope→count `Map` for one resource key.
- **`IScopeRegistry`** (exported interface) — the shape returned by `scopeRegistryFor`; exposes `claim` and `isLive`.
    - `claim(scope: unknown[])` → a one-shot release function that decrements the count (deletes the entry at 0).
    - `isLive(scope: unknown[])` → `boolean`; true while at least one instance still claims the scope.
- **`scopeRegistryFor(queryClient, resourceKey)`** (exported factory) — returns a fresh `IScopeRegistry` bound to the given pair. Uses `stableKey` (from `plainData`) to serialise the scope array into a string map key.

## Relationships

- **`src/internal/plainData.ts`** — provides `stableKey`, used to convert a scope array into a deterministic string for `Map` lookup.
- **`src/internal/resourceMutations.ts` / `src/internal/restResource.ts`** — graph neighbors that consume `scopeRegistryFor` to claim/release scopes around their lifecycle (start-up sweeps, `dependsOn` transitions).
- **`tests/internal/scopeRegistry.spec.ts`** — unit tests for the registry's claim/release/idempotency semantics.

## Notes

- The release function returned by `claim` is **idempotent** — calling it a second time is a no-op (guarded by a `released` flag).
- Counts are keyed by `stableKey(scope)`, so scope comparison is structural, not referential.
- Because the top-level map is a `WeakMap` keyed on `QueryClient`, registries are garbage-collected automatically when the client is dropped; no explicit teardown is needed.
- Only one level of indirection (`resourceKey`) sits between the client and the scope map; there is no per-instance isolation beyond the scope key itself.
