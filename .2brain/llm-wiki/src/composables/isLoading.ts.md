---
source: src/composables/isLoading.ts
sha256: 946dbc5862091b3675b219d1a34875886affdf76fb62a9331f35ce2aa4792859
generated_at: 2026-09-28T22:29:10.222461+00:00
model: ollama:qwen3.8:27b
---

# src/composables/isLoading.ts

## Purpose

Provides a single composable (`useIsLoading`) that answers "is anything of these resources busy right now?" at a layout or page level. It wraps TanStack Query's `useIsFetching` / `useIsMutating` counters and filters them by resource-key prefix, so a parent component can show a global spinner without tracking individual resource `isLoading` flags.

## Key elements

- **`useIsLoading(prefixes?, queryClient?) → ComputedRef<boolean>`** — the sole export. Returns a reactive ref that is `true` while at least one matching query or mutation is in flight.
    - `prefixes` (default `[]`) — `resourceKey` prefixes to match. An empty array matches **every** resource on the client.
    - `queryClient` — optional; falls back to the client injected by `VueQueryPlugin`.
- **`matchesPrefix` (internal)** — delegates to `matchesAnyPrefix` from `src/internal/plainData.ts` to test whether the first segment of a query/mutation key starts with one of the given prefixes.

## Relationships

- **`src/internal/plainData.ts`** — supplies the `matchesAnyPrefix` utility used for the prefix-matching predicate.
- **`src/index.ts`** — package entry point; re-exports `useIsLoading` so consumers can `import { useIsLoading } from '…'`.
- **`tests/isLoading.spec.ts`** — runtime unit tests covering the prefix-matching and in-flight detection logic.
- **`tests/types/isLoading.test-d.ts`** — type-level assertions on the composable's signature and return type.
- **`package.json`** — declares the `vue` and `@tanstack/vue-query` runtime dependencies this file imports.

## Notes

- Prefix matching is a simple **startsWith** check on the **first segment** of the key (`query.queryKey[0]` / `mutation.options.mutationKey?.[0]`). `'account'` matches both `'account'` and `'accountProfile'`.
- Unlike a per-resource `isLoading(key)` which returns a plain `boolean`, this composable returns a `ComputedRef<boolean>` and is intended to be called **once in `setup`**, then read reactively.
- The counters are **client-wide**: the composable sees every in-flight query/mutation on the supplied `QueryClient`, regardless of whether the current component subscribes to those resources.
- `mutation.options.mutationKey` is read with optional chaining (`?.[0]`) because mutations registered without an explicit key will have `undefined`.
