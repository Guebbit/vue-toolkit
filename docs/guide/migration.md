# Migrating from 4.x to 5.0

`useStructureRestApi` is rebuilt directly on [TanStack Query](https://tanstack.com/query) as the
single source of truth for records, lists, searches, freshness, invalidation and loading — see
[`useStructureRestApi`](/composables/structure-rest-api) for how the new engine works. Most of the
rest of this release is naming and typing cleanup that fell out of that rebuild. Every item below
has its own entry in the `CHANGELOG`'s `# 5.0.0` section, with the full reasoning; this page is
the shape of the work, not the why.

## Peer dependencies

```diff
- npm install @guebbit/vue-toolkit @tanstack/query-core
+ npm install @guebbit/vue-toolkit @tanstack/vue-query
```

`vue-query` **is** `query-core` plus the Vue layer — installing `query-core` directly alongside it
is a real failure (a client built from the wrong copy silently never fetches), not a warning. Set
up one client per app:

```ts
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

const queryClient = new QueryClient()
app.use(VueQueryPlugin, { queryClient })
```

There is no private, toolkit-owned `QueryClient` any more. Every `useStructureRestApi`/
`useStructureSearchApi`/`useStructureCrudApi` call either takes one explicitly via `queryClient`,
or finds it through this injection — which also works inside a Pinia setup store, on `pinia
^2.1` (see below). 4.x's private client set `retry: false` and `networkMode: 'always'`; a plain
`new QueryClient()` keeps TanStack's own defaults instead. To keep the 4.x behaviour:

```ts
new QueryClient({
    defaultOptions: {
        queries: { retry: false, networkMode: 'always' },
        mutations: { networkMode: 'always' }
    }
})
```

Peer floors moved too — see [Peer dependencies](/guide/getting-started#peer-dependencies) for the
full table:

| Peer | 4.x | 5.0 | Why |
| --- | --- | --- | --- |
| `@tanstack/vue-query` | (not a peer) | `^5.103` | replaces `@tanstack/query-core` |
| `vue` | `>=3.4` | `^3.4` | caret, not open-ended; no consumer on a current major is affected |
| `pinia` | `>=2.0.0` | `^2.1 \|\| ^3` | a Pinia SETUP store's own setup function did not run inside Vue's injection context before 2.1, so `useQueryClient()` inside one silently found nothing — this never actually worked on `2.0.x` |
| `zod` (optional) | `>=4.4.3` | `^4.4.3` | caret, not open-ended |

## Renames

| Old | New | Where |
| --- | --- | --- |
| `loadingKey` | `resourceKey` (now **required**) | resource option, and the returned field |
| `TTL` | `staleTime` | resource option and per-call setting |
| `lastUpdateKey: 'x'` | `key: ['x']` (now an array) | per-call setting |
| `mismatch` | `partial` | per-call setting |
| `fetchAgain` | `applyResponse` | `updateTarget` setting |
| `IToastType` | `EToastType` | `useNotificationsStore` |
| `IStructureRestApi` | `IStructureRestApiOptions` | the *options* type |
| `IStructureCrudSettings` | `IStructureCrudApiOptions` | the *options* type |
| — | `IStructureRestApi`, `IStructureSearchApi`, `IStructureDataManagementApi` | these now name each composable's **return** type (previously unnamed/inferred), matching `IStructureCrudApi` |
| `checkAny('x')` | `checkAny(['x'])` | follows the `key` array change above |

## Removed

| Removed | Use instead |
| --- | --- |
| `destroy()` | stop the owning effect scope (ends subscriptions/watchers); `resetAll()` removes the data |
| `startLoading()` / `stopLoading()` | nothing — TanStack already knows what's in flight |
| `getLoading` / `setLoading` resource options | tag a call with `key`, read `isLoading(key)` |
| per-call `loading` / `loadingKey` settings | `key`, read via `isLoading(key)` |
| `saveRecords` | `addRecords` / `editRecords` |
| `fetchLike` | `createTarget` (or `updateTarget` with `applyResponse: false` to opt out) |
| `searchCleanup()` / `resetSearches()` / `searchCached` / `ISearchCache` | nothing — a search's pages are cache entries, read directly; there is no separate index |
| `searchKeyGen` (on the returned object) | pass the filters object straight to `searchGet`/`checkSearch` |

## Behaviour changes worth checking

These aren't renames — the name is the same, but what happens under it changed:

- **`resourceKey` has no random fallback.** A resource that didn't set one used to get a random
  key; it's a required option now.
- **Per-call settings are typed per method.** Each method accepts only the fields it actually
  reads — passing an unrelated one is now a type error, not a silently-ignored extra property.
- **Records are read-only.** `itemDictionary`/`getRecord(...)`/`parentHasMany` are computed views
  over the cache — writing into them is ignored (with a Vue warning) instead of mutating the
  store. Write through `addRecord`/`editRecord`/`updateTarget`, link children with `addToParent`.
- **`fetchMultiple` resolves one slot per requested id** (fetched first, then cached, `undefined`
  for one the server left out) — 4.x resolved every item the server returned, in whatever order.
- **Raw cache keys carry ids as strings.** A direct `queryClient` call addressing a record or a
  parent list needs `String(id)`, not the raw value — `5` and `'5'` now address the same entry.
- **A search's `apiCall` resolves `{ items, totalItems }`**, not a bare array — same for
  `fetchSearch`, `search()`, `searchNow()` and `resetFilters()`. `totalItems` now survives a cache
  hit, since it's stored alongside the page that produced it.
- **The applied search, not the live filters, drives what's on screen.** Binding a filter form's
  inputs straight to `filters` no longer blanks the list while the user types — nothing shows
  until `search()`/`searchNow()` is called. See [The applied
  search](/composables/structure-search-api#the-applied-search).
- **Changing `pageSize` on the search/CRUD layer now also resets `pageCurrent` to `1`**, in the
  same fetch. Unchanged on `useStructureDataManagement`'s/`useStructureRestApi`'s own client-side
  pagination.
- **Every watcher returns `{ stop, refetch, error }`** (`IWatchHandle`), not a bare stop function
  or an ad-hoc shape — see the before/after below. A watcher never rejects any more; a failure
  shows in `error` (and `onError` where offered).
- **`useStructureCrudApi`'s `operations` parameter is required** — it no longer defaults to `{}`.
- **`useStructureCrudApi`'s read operations take no `options` parameter**: `list: () => …`,
  `search: (filters, page, pageSize) => …`, `get: (id) => …` — it was never forwarded to them.
  `updateTarget`'s `apiCall` is now typed `() => Promise<F>` (was `() => Promise<F | (T |
  undefined)[]>`); a response that isn't a record object (empty, an array, a primitive) keeps the
  optimistic patch.
- **`updateTarget`/`deleteTarget`'s mutation key carries the id as `String(id)`**, matching a
  record's query key. Only visible to a hand-written `isMutating`/`isLoading` filter matching on
  the mutation key's id segment directly — match `String(id)` instead of `id`.
- **A resource's data outlives the effect scope that built it.** 4.x cleared everything when the
  owning component/store was disposed; now stopping a scope only ends subscriptions and watchers.
  Call `resetAll()` first, or rely on a `dependsOn` change, when data must actually leave memory.
- **`K`'s default type is `TIdOf<T>`** (the type of `T['id']` when `T` has one), not `keyof T` (the
  union of field names). Code that relied on the old default — `getRecord('id')` with the literal
  field name, say — needs `K` passed explicitly now: `useStructureRestApi<IUser, keyof IUser>(...)`.
- **`useCoreStore`'s `setLoading(key, value)` and `getLoading(key)` require every argument.**
  `setLoading('x')` used to quietly store `false`.
- **`useStructureCrudApi`'s `createOne`/`updateOne`/`deleteOne` take one settings object**, not a
  bare per-call argument — see the before/after below.

## Before / after

**Peer swap and client setup:**

```ts
// 4.x
import { createApp } from 'vue'
const app = createApp(App)
// no shared client — each resource owned its own

// 5.0
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

const queryClient = new QueryClient()
const app = createApp(App)
app.use(createPinia())
app.use(VueQueryPlugin, { queryClient })
```

**`resourceKey` required, `TTL` renamed:**

```ts
// 4.x
const users = useStructureRestApi<IUser, number>({ TTL: 60_000 })

// 5.0
const users = useStructureRestApi<IUser, number>({
    resourceKey: 'users', // required — no random fallback any more
    staleTime: 60_000
})
```

**Every watcher returns a handle:**

```ts
// 4.x
const stop = watchTarget(userId, fetchUser)

// 5.0 — apiCall first, idSource second (matches fetchTarget/watchByParent); returns a handle
const { stop, refetch, error } = watchTarget(fetchUser, userId)
```

**CRUD's `createOne`/`updateOne`/`deleteOne` take a settings object:**

```ts
// 4.x
crud.createOne(data, axiosConfig)
crud.updateOne(id, data, axiosConfig)

// 5.0
crud.createOne(data, { requestOptions: axiosConfig })
crud.updateOne(id, data, { requestOptions: axiosConfig, merge: true })
```

Every change above has its own `CHANGELOG` entry under `# 5.0.0`, with the exact reasoning and
migration for that one item.
