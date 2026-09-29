---
generated_at: 2026-09-28T23:17:48.517171+00:00
model: ollama:qwen3.8:27b
---

# Repository Overview

## What This Is

A **Vue.js composables library** that provides a structured client layer for REST APIs. It bundles data-fetching, CRUD, search, form-validation, and cache-management logic into reusable Vue composables backed by Pinia stores and TanStack Query. The library ships its own VitePress documentation site and a thorough test suite (unit, property-based via FastCheck, browser, and mutation testing via Stryker).

## Main Areas

| Area                   | Key files                                                                                                                                                                                   | Role                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Public composables** | `src/composables/structure*.ts`, `asyncAction.ts`, `uploadProgress.ts`, `livenessProbe.ts`, `isLoading.ts`                                                                                  | The consumer-facing API: REST resource CRUD, search, data management, form validation, async action helpers, upload progress, and a liveness/health probe.                                                                       |
| **Pinia stores**       | `src/stores/core.ts`, `src/stores/notifications.ts`                                                                                                                                         | Application-level state: a core store (likely session/scope context) and a notification/toast store.                                                                                                                             |
| **Internal engine**    | `src/internal/restResource.ts`, `queryRecordStore.ts`, `recordMutations.ts`, `scopeRegistry.ts`, `identifierJoin.ts`, `parentRelations.ts`, `plainData.ts`, `tanstackQueryOptions.ts`, etc. | The lower-level machinery: a REST resource model, a query-backed record store (TanStack Query integration), identifier/parent-relation resolution, scope registration, mutation and removal logic, and plain-data normalisation. |
| **Entry point**        | `src/index.ts`                                                                                                                                                                              | Re-exports the public composables and stores.                                                                                                                                                                                    |
| **Documentation**      | `docs/` (VitePress)                                                                                                                                                                         | Per-composable reference pages, getting-started, migration, and testing guides.                                                                                                                                                  |
| **Tests**              | `tests/`                                                                                                                                                                                    | Per-composable spec suites, property-based tests for internal normalisation, browser tests (GC, plugin, focus/online), and a shared harness/fake-Api layer.                                                                      |
| **Tooling**            | `package.json`, `eslint.config.ts`, `stryker.conf.json`                                                                                                                                     | Build, lint, and mutation-testing configuration.                                                                                                                                                                                 |

## How They Relate

```
consumer app
   │
   ▼
composables (structureRestApi, structureSearchApi, …)
   │  read / write
   ▼
stores (core, notifications)  ◄──►  internal engine
   │                              (restResource, queryRecordStore,
   ▼                              scopeRegistry, recordMutations, …)
TanStack Query / REST backend
```

Composables are the thin public surface. They delegate to the internal engine for cache, mutation, and scoping concerns and surface state through Pinia stores. `src/index.ts` is the single import point for consumers.

## Where to Start

1. **`src/index.ts`** – see exactly what is exported.
2. **`docs/guide/getting-started.md`** – intended onboarding path.
3. **`src/composables/structureRestApi.ts`** – the central composable; it pulls in the most internal modules (24 direct connections per the dependency graph).
4. **`src/internal/restResource.ts`** – the core data model the rest of the engine builds on.
5. **`tests/structureRestApi/_helpers/harness.ts`** – the test harness that wires a fake API; the fastest way to understand expected runtime behaviour without reading every spec.
