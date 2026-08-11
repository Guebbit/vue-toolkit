# @guebbit/vue-toolkit

[![npm version](https://img.shields.io/npm/v/@guebbit/vue-toolkit.svg)](https://www.npmjs.com/package/@guebbit/vue-toolkit)
[![license](https://img.shields.io/npm/l/@guebbit/vue-toolkit.svg)](./LICENSE)

Vue 3 composables and Pinia stores for CRUD screens: a normalized record store, a REST layer with
caching and optimistic updates (rolled back automatically on failure), Zod-backed form
validation, and toast/loading stores.

## Install

```bash
npm install @guebbit/vue-toolkit
```

Peer dependencies: `vue >= 3.0.0`, `pinia >= 2.0.0`.

## Quick intro

### `useStructureCrudApi` — a whole resource, from the calls that reach it

The highest-level entry point, and the one to start from. Everything below is still available
through it, so it is a convenience and never a ceiling.

```ts
import { useStructureCrudApi } from '@guebbit/vue-toolkit';

export const useProductsStore = defineStore('products', () => ({
    ...useStructureCrudApi<IProduct, string, IProductFilters>({
        list: () => listProducts().then((r) => r.data.items),
        search: (filters, page, pageSize) =>
            listProducts({ ...filters, page, pageSize }).then((r) => r.data.items),
        get: (id) => getProductById(id).then((r) => r.data),
        create: (data) => createProduct(data).then((r) => r.data),
        update: (id, data) => updateProductById(id, data).then((r) => r.data),
        remove: (id) => deleteProductById(id)
    })
}));

// …and the store is done: filters, pagination, caching, optimistic updates and rollback included
const { filters, pageItemList, pageCurrent, watchList, searchNow, updateOne } = useProductsStore();
watchList({ onError: notifyError });
```

Every operation is optional — a read-only resource supplies `list` and `get` and nothing else.

### `useStructureRestApi` — fetch, cache, and mutate against a REST API

```ts
import { useStructureRestApi } from '@guebbit/vue-toolkit';

const users = useStructureRestApi<IUser, number>({ identifiers: 'id' });

await users.fetchAll(() => axios.get('/api/users').then((r) => r.data));
users.itemList.value; // IUser[], cached and deduplicated across callers

// Optimistic — updates locally right away, rolls back automatically on failure
await users.updateTarget(
    () => axios.put('/api/users/1', { name: 'New name' }).then((r) => r.data),
    { name: 'New name' },
    1
);
```

### `useStructureSearchApi` — the same, plus filtered pagination

```ts
import { useStructureSearchApi } from '@guebbit/vue-toolkit';

const filters = ref({ text: '' });
const products = useStructureSearchApi<IProduct, string, string, typeof filters.value>(
    () => filters.value
);

// re-runs on every pageCurrent/pageSize change; `search()` applies edited filters on demand
const { search } = products.watchSearch((currentFilters, page, pageSize) =>
    listProducts({ ...currentFilters, page, pageSize }).then((r) => r.data.items)
);

products.pageItemList.value; // the current search's current page
```

### `useStructureDataManagement` — normalized store, no networking

```ts
import { useStructureDataManagement } from '@guebbit/vue-toolkit';

const users = useStructureDataManagement<IUser>('id');
users.addRecord({ id: 1, name: 'Alice' });
users.getRecord(1); // { id: 1, name: 'Alice' }
```

### `useStructureFormValidation` — reactive form state + Zod validation

```ts
import { z } from 'zod';
import { useStructureFormValidation } from '@guebbit/vue-toolkit';

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
const login = useStructureFormValidation({ email: '', password: '' }, loginSchema, { formElement });

// Owns `showFormErrors`: a rejected submit reveals the errors and focuses the first invalid field
await login
    .handleSubmit(async (data) => api.post('/login', data))
    .catch((error) => {
        // and the errors only the server can find go under the right input too
        if (!login.applyServerErrors(error)) notifications.addMessage('Something went wrong');
    });
```

### `useUploadProgress` — a progress bar for one upload, without an HTTP client

```ts
import { useUploadProgress } from '@guebbit/vue-toolkit';

// the one client-specific line, written once per app
const { progress, isUploading, track } = useUploadProgress<AxiosRequestConfig>((onProgress) => ({
    onUploadProgress: (event) => onProgress(event.progress ?? 0)
}));

// `enabled` off means no options are passed at all — no bar flashing for a payload with no file
await track((options) => updateProduct(id, data, options), { enabled: !!file });
```

### `useNotificationsStore` — toasts, as a Pinia store

```ts
import { useNotificationsStore, IToastType } from '@guebbit/vue-toolkit';

const notifications = useNotificationsStore();
notifications.addMessage('Saved successfully', IToastType.SUCCESS, 4000);
```

## Documentation

The snippets above are just the entry point. Full API reference, setup options, and the gotchas
that matter in practice: **[guebbit.github.io/vue-toolkit](https://guebbit.github.io/vue-toolkit/)**

## License

AGPL-3.0 — see [LICENSE](./LICENSE).
