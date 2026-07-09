# Getting Started

`@guebbit/vue-toolkit` is a small set of Vue 3 composables and Pinia stores for building CRUD
screens: a normalized record store, a REST layer with caching, request dedup, and optimistic
mutations with automatic rollback (built on [TanStack Query](https://tanstack.com/query)),
Zod-backed form validation, and two small Pinia stores (toasts, named loading flags).

## Install

```bash
npm install @guebbit/vue-toolkit
```

### Peer dependencies

The package expects these already in your project:

| Package | Version   |
| ------- | --------- |
| `vue`   | `>=3.0.0` |
| `pinia` | `>=2.0.0` |

`useStructureRestApi` also pulls in `@tanstack/query-core` and `@tanstack/vue-query` as regular
dependencies — nothing extra to install, but be aware they land in your bundle.

## What to use, and when

- **[`useStructureDataManagement`](/composables/structure-data-management)** — the base: a
  normalized `{ id -> record }` store with CRUD, selection, client-side pagination, and
  `hasMany`/`belongsTo` bookkeeping. Reach for this when you already have the data and just need
  somewhere reactive to put it.
- **[`useStructureRestApi`](/composables/structure-rest-api)** — everything above, plus fetch
  methods that cache, deduplicate, and support optimistic mutations with automatic rollback. Reach
  for this when the data comes from a REST API — it's the composable most apps will use directly.
- **[`useStructureFormValidation`](/composables/structure-form-validation)** — reactive form
  state with optional Zod validation and a submit-flow wrapper.
- **[`useNotificationsStore`](/stores/notifications)** — toast messages and named dialog flags,
  as a Pinia store.
- **[`useCoreStore`](/stores/core)** — a global named-loading-flags store, for one loading
  indicator shared across composables/components instead of ad-hoc local refs.

Each reference page documents the full API and the gotchas that matter in practice.
