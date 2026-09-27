# useIsLoading

"Is anything of these resources busy?", across the whole app: true while any query or mutation
whose `resourceKey` starts with one of the given prefixes is in flight. For a layout-level
spinner that is not tied to one resource.

## Quickstart

```ts
import { useIsLoading } from '@guebbit/vue-toolkit'

// in a layout component's setup()
const isAccountAreaLoading = useIsLoading(['account', 'cart'])
const isAnythingLoading = useIsLoading()
```

```vue
<v-progress-linear v-if="isAccountAreaLoading" indeterminate />
```

## API

`useIsLoading(prefixes?, queryClient?)` returns `ComputedRef<boolean>`.

| Parameter     | Type          | Default                          | Purpose                                                                  |
| ------------- | ------------- | -------------------------------- | ------------------------------------------------------------------------ |
| `prefixes`    | `string[]`    | `[]`                             | `resourceKey` prefixes to match. Empty: every query and mutation on the client. |
| `queryClient` | `QueryClient` | the one `VueQueryPlugin` provides | The client to watch. Pass it where there is no injection context (a plain `effectScope`, a test). |

## How it matches

- It reads TanStack's own counters (`useIsFetching` + `useIsMutating`), filtered by the first
  segment of each query or mutation key: a resource's `resourceKey`.
- A prefix matches by **string** start: `'account'` matches `'account'` and `'accountProfile'`.
  Name resources with that in mind.
- It sees every resource on the client, whether this component uses it or not, including queries
  and mutations you make yourself with keys starting with a matching string.
- It is already a `ComputedRef`: call it once in `setup()`, not inside a `computed`.

## Compared with the other loading flags

| Question                                                     | Use                                                             |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| Is this resource busy? Is this one call of it busy?          | The resource's own [`loading` / `isLoading(key)`](./structure-rest-api#loading), which matches the call's `key` by segment prefix. |
| Is any resource under these prefixes busy?                   | `useIsLoading(prefixes)`                                        |
| Is my own, non-request work busy (a wizard step, a computation)? | [`useCoreStore`](/stores/core), which uses the same string-prefix rule on its flag names. |

## Gotchas

- **Needs an effect scope.** Like every TanStack composable it subscribes to the client and
  unsubscribes when the surrounding scope (component, Pinia setup store, `effectScope`) stops.
  Created outside any scope, that subscription is never released.
- **Needs an injection context for the default client.** Outside a component's `setup()` or a Pinia
  setup store, pass `queryClient` explicitly.
