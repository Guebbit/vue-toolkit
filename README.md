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
const login = useStructureFormValidation({ email: '', password: '' }, loginSchema);

await login.handleSubmit(async (data) => api.post('/login', data));
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
