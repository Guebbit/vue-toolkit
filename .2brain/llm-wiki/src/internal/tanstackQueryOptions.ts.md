---
source: src/internal/tanstackQueryOptions.ts
sha256: de91ae4d50e97960a812de1028684b72296179f92128a6f7d07ca0527cb7d04e
generated_at: 2026-09-28T22:37:53.487887+00:00
model: ollama:qwen3.8:27b
---

# src/internal/tanstackQueryOptions.ts

## Purpose

Whitelists the subset of TanStack Query options a caller is permitted to pass through `queryOptions`. It exists to prevent engine-owned options (e.g. `gcTime`, `select`) from leaking into `useQuery` and silently corrupting the cache layout that every read in the app relies on.

## Key elements

- **`ALLOWED_KEYS`** – A `Record<keyof ITanStackQueryOptions, true>` listing the five caller-facing options: `retry`, `retryDelay`, `refetchInterval`, `refetchOnWindowFocus`, `refetchOnReconnect`. Because it is typed as a `Record` over the _entire_ key set of `ITanStackQueryOptions`, adding a new key to that interface without listing it here is a compile error.
- **`pickQueryOptions(options?)`** – The single export. Takes a caller-supplied `ITanStackQueryOptions` (possibly carrying extra keys from a JS caller or a widened object) and returns a new object containing only the allowed keys. Keys explicitly set to `undefined` are preserved so they can still override a resource-level default via spread semantics.

## Relationships

- **`src/composables/structureRestApi.ts`** – Source of the `ITanStackQueryOptions` type that this module imports and keys its whitelist against. Any change to that interface propagates a build error here until `ALLOWED_KEYS` is updated.
- **`src/internal/restResource.ts`** – Consumes `pickQueryOptions` to sanitize caller options before they reach the underlying `useQuery` call, ensuring only the whitelisted keys are forwarded.

## Notes

- The whitelist is intentionally **narrow**: it is not a pass-through. If a new option is added to `ITanStackQueryOptions` and should _not_ be exposed to callers, simply omit it from `ALLOWED_KEYS` and the build will still pass (the `Record` type requires listing every key, so you must add it with `true` or the build fails—review intent before adding).
- Stryker mutation testing is disabled for the `ALLOWED_KEYS` values because they are read only for their keys, never their values.
- `pickQueryOptions` returns a **new** object (`Object.fromEntries`), not a reference to the input, so downstream mutation of the result cannot affect the caller.
