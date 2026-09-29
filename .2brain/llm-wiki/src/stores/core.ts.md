---
source: src/stores/core.ts
sha256: aa3c98fab73e7e957ff77dd06eb40c336cd6be282fee3039edebd76d5ac9aa85
generated_at: 2026-09-28T22:38:09.051831+00:00
model: ollama:qwen3.8:27b
---

# src/stores/core.ts

## Purpose

A single Pinia setup store (`'core'`) that holds app-wide boolean loading flags in a flat `Record<string, boolean>`. It gives components, route guards, and composables one shared source of truth for "is this work in progress?" questions, with prefix-based querying so a single call can cover a whole module, a screen, or one button.

## Key elements

- **`useCoreStore`** — the exported Pinia store (id `'core'`, setup-style).
- **`loadings`** — reactive `Record<string, boolean>`; a missing key reads as "not loading."
- **`setLoading(key, value)`** — writes one flag. Both args are required by design: omitting `value` would let a caller accidentally toggle a "started" flag off.
- **`getLoading(key)`** — reads one flag by exact key; returns a coerced `boolean` (unknown keys → `false`).
- **`isLoading(prefixes?)`** — returns `true` if _any_ flag whose key matches one of the given prefixes is `true`. An empty/omitted prefix list matches any key. Deliberately a plain function (not a computed) because the result depends on the argument; call it inside a computed to keep it reactive.
- **`resetLoadings()`** — replaces the entire map with a fresh `{}` (useful for teardown or test isolation).

## Relationships

- **`src/internal/plainData.ts`** — provides `matchesAnyPrefix`, the utility that powers prefix matching inside `isLoading`.
- **`src/index.ts`** — application entry point; makes the store (and its deps) part of the public module graph.
- **`package.json`** — declares the runtime dependencies this file imports (`vue`, `pinia`).
- **`tests/core.spec.ts`** — unit tests exercising the store's getters, setters, and reset behavior.
- **`tests/types/stores.test-d.ts`** — compile-time type assertions ensuring the store's public shape stays stable.

## Notes

- Keys are conventionally namespaced with a colon (`'owner:action'`). There is no validation of the format; it's a team convention enforced by code review.
- `isLoading` is **not** reactive on its own. If you need a reactive "is my module busy?" flag in a template, wrap it: `computed(() => useCoreStore().isLoading(['accountProfile']))`.
- `resetLoadings` replaces the ref's value with a brand-new object rather than mutating entries, so watchers keyed on the ref object identity will fire.
- The store id `'core'` appears in Pinia devtools and is the SSR state key; renaming it is a breaking change for persisted state.
