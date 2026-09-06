# useCoreStore

A small Pinia store (id `'core'`) for global named loading flags — one place to track "is
anything loading" across composables and components, instead of ad-hoc local refs per screen.

## Quickstart

```ts
import { useCoreStore } from '@guebbit/vue-toolkit'

const core = useCoreStore()

core.setLoading('accountProfile', true)
core.getLoading('accountProfile') // true
core.isLoading() // true — at least one key is active
core.isLoading(['cart']) // false — nothing under that prefix is

core.setLoading('accountProfile', false)
core.isLoading() // false
```

This is the same shape `useStructureRestApi` expects if you wire it to an external loading store
via its `getLoading`/`setLoading` options — see
[Setup options](/composables/structure-rest-api#setup-options).

## Scoping with prefixes

`isLoading()` with no argument is "is the app doing literally anything", which is rarely what a
screen wants to render: a background poll lights the same indicator as a user's save. Pass
prefixes to ask a narrower question.

Give each store a stable `loadingKey` (its Pinia id is already unique) and each call its action
postfix, and the dictionary's keys become addressable:

```ts
// in the store
useStructureRestApi<User, string>({ loadingKey: 'accountProfile', getLoading, setLoading })
// at the call site
updateProfile(payload, { loadingKey: ':avatar-upload' }) // -> 'accountProfile:avatar-upload'
```

```ts
// one global overlay, one discreet indicator, one button spinner — same dictionary
const isBootLoading = computed(() => core.isLoading(['core']))
const isSideLoading = computed(() => core.isLoading(['account', 'cart', 'orders']))
const isUploading = computed(() => core.getLoading('accountProfile:avatar-upload'))
```

A prefix matches from the start of the key, so `'account'` covers every store and action under
it. Keep that in mind when naming: a future `accounting` store would answer to `'account'` too.

`isLoading` is a plain function rather than a computed, so it does not come out of `storeToRefs`
— destructure it from the store itself, and call it inside a `computed` to stay reactive.

## API

| Property / method            | Purpose                                              |
| -------------------------------- | ----------------------------------------------------------- |
| `loadings`                     | Ref — `Record<string, boolean>` of every tracked key.  |
| `isLoading(prefixes?)`         | `true` when a key is active; scoped to keys starting with one of `prefixes`, or any key when omitted. |
| `setLoading(key, value)`       | Sets one key's loading state.                          |
| `getLoading(key)`              | Reads one key's loading state.                         |
| `resetLoadings()`              | Clears every tracked key.                               |
