# useCoreStore

A small Pinia store (id `'core'`) for your own, non-server named loading flags: one place to track
"is anything loading" for work that has no request behind it (a client-side computation, a
multi-step wizard), instead of ad-hoc local refs per screen.

Server work does not go through this store. A REST resource knows its own loading state
([`loading` / `isLoading(key)`](/composables/structure-rest-api#loading)), and
[`useIsLoading`](/composables/is-loading) answers "is any of these resources busy" across the app,
both read straight from the shared TanStack cache.

## Quickstart

```ts
import { useCoreStore } from '@guebbit/vue-toolkit'

const core = useCoreStore()

core.setLoading('onboardingWizard', true)
core.getLoading('onboardingWizard') // true
core.isLoading() // true: at least one key is active
core.isLoading(['cart']) // false: nothing under that prefix is

core.setLoading('onboardingWizard', false)
core.isLoading() // false
```

## Scoping with prefixes

`isLoading()` with no argument is "is the app doing anything at all", which is rarely what a screen
wants to render: an unrelated background flag lights the same indicator as the one you care about.
Pass prefixes to ask a narrower question:

```ts
const isBootLoading = computed(() => core.isLoading(['onboarding']))
const isUploading = computed(() => core.getLoading('onboardingWizard:avatar-upload'))
```

A prefix matches from the start of the key, so `'onboarding'` covers every flag under it. Keep
that in mind when naming: an unrelated `onboardingV2` flag would answer to it too.

`isLoading` is a plain function rather than a computed, so it does not come out of `storeToRefs`:
take it from the store itself, and call it inside a `computed` to stay reactive.

## API

| Property / method        | Purpose                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| `loadings`               | Ref: `Record<string, boolean>` of every tracked key.                                              |
| `isLoading(prefixes?)`   | `true` when a key is active; only keys starting with one of `prefixes`, or any key when omitted.  |
| `setLoading(key, value)` | Sets one key's loading state. Returns the value stored.                                           |
| `getLoading(key)`        | Reads one key's loading state; an unknown key reads `false`.                                      |
| `resetLoadings()`        | Clears every tracked key.                                                                         |
