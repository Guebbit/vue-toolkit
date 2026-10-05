# @guebbit/vue-toolkit

[![npm version](https://img.shields.io/npm/v/@guebbit/vue-toolkit.svg)](https://www.npmjs.com/package/@guebbit/vue-toolkit)
[![license](https://img.shields.io/npm/l/@guebbit/vue-toolkit.svg)](./LICENSE)

Vue 3 composables and Pinia stores for CRUD screens: a normalized record store, a REST layer built
directly on [TanStack Query](https://tanstack.com/query) — one shared cache, optimistic updates
rolled back automatically on failure — Zod-backed form validation, and toast/loading stores.

**Documentation: [guebbit.github.io/vue-toolkit](https://guebbit.github.io/vue-toolkit/)**

## Install

```bash
npm install @guebbit/vue-toolkit @tanstack/vue-query pinia
npm install zod # optional: only useStructureFormValidation needs it
```

| Peer                  | Version                |
| --------------------- | ---------------------- |
| `vue`                 | `^3.4`                 |
| `pinia`               | `^2.1 \|\| ^3 \|\| ^4` |
| `@tanstack/vue-query` | `^5.103`               |
| `zod` (optional)      | `^4.4.3`               |

Install `@tanstack/vue-query`, never `@tanstack/query-core` next to it. The package ships ES2023:
Chrome/Edge 110+, Firefox 115+, Safari 16+, Node 22+.

## Setup

```ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';

const app = createApp(App);
app.use(createPinia());
// one client per app: every resource shares it, which is what lets them invalidate each other
app.use(VueQueryPlugin, { queryClient: new QueryClient() });
```

## What to use

| You want…                                                             | Use                                |
| --------------------------------------------------------------------- | ---------------------------------- |
| A whole resource: list, filtered search, read, create, update, delete | `useStructureCrudApi` (start here) |
| Filtered, server-paginated search, wiring the calls yourself          | `useStructureSearchApi`            |
| One fetch, watcher or optimistic write at a time                      | `useStructureRestApi`              |
| A normalized record store for data you already have                   | `useStructureDataManagement`       |
| Form state, Zod validation, errors the server found                   | `useStructureFormValidation`       |
| A progress bar for one upload                                         | `useUploadProgress`                |
| `data` / `error` / `loading` for one call that is not a resource      | `useAsyncAction`                   |
| A "the API is unreachable" banner                                     | `useLivenessProbe`                 |
| "Is anything loading?" across the app                                 | `useIsLoading`, `useCoreStore`     |
| Toasts, and messages that stay until the user deletes them            | `useNotificationsStore`            |

## A CRUD resource in one store

```ts
import { defineStore, storeToRefs } from 'pinia';
import { useStructureCrudApi } from '@guebbit/vue-toolkit';

export const useProductsStore = defineStore('products', () => ({
    // <record, id, filters>
    ...useStructureCrudApi<IProduct, string, IProductFilters>(
        {
            list: () => listProducts(),
            search: (filters, page, pageSize) =>
                searchProducts(filters, page, pageSize).then((r) => ({
                    items: r.items,
                    totalItems: r.total
                })),
            get: (id) => getProduct(id),
            create: (data) => createProduct(data),
            update: (id, data) => updateProduct(id, data),
            remove: (id) => deleteProduct(id)
        },
        // resourceKey: the first segment of every cache key this resource makes
        { resourceKey: 'products', initialFilters: { text: '' } }
    )
}));

// In a component: state through storeToRefs, methods from the store itself.
const store = useProductsStore();
const { filters, pageItemList, pageCurrent, pageTotal, totalItems } = storeToRefs(store);
const { error } = store.watchList(); // the active search; never rejects
store.updateOne('42', { title: 'New title' }).catch(showError); // optimistic, rolled back on failure
```

Every operation is optional (a read-only resource supplies `list` and `get`). Everything the lower
layers offer stays reachable on the same object.

## Learn more

- [Getting Started](https://guebbit.github.io/vue-toolkit/guide/getting-started) — setup and the
  client options that matter.
- [Your first CRUD screen](https://guebbit.github.io/vue-toolkit/guide/first-crud-screen) — store,
  list and edit form, step by step.
- [Reference](https://guebbit.github.io/vue-toolkit/composables/structure-crud-api) — every
  composable and store.
- [Migrating from 4.x](https://guebbit.github.io/vue-toolkit/guide/migration) and the
  [Changelog](https://guebbit.github.io/vue-toolkit/changelog).
- [Contributing](https://guebbit.github.io/vue-toolkit/guide/development) — scripts, the quality
  gate (`npm run complete`) and trying a change in an app before publishing.

## License

AGPL-3.0 — see [LICENSE](./LICENSE).
