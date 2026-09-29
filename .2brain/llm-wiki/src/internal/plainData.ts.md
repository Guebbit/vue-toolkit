---
source: src/internal/plainData.ts
sha256: 661a73daed2c6f83f82963ed9b27cabe275b8eb8e6ddc62c4675fc38c62d3eda
generated_at: 2026-09-28T22:33:36.989945+00:00
model: ollama:qwen3.8:27b
---

# src/internal/plainData.ts

## Purpose

Provides identity comparison and deep-copy utilities for plain-data values (filters, `dependsOn` snapshots, key segments). Two core operations: `stableKey` produces a canonical string so values compare by content rather than reference, and `detachedCopy` rebuilds a value so later mutations to the source (e.g. a bound form) cannot reach the copy.

## Key elements

- **`stableKey(value)`** — Returns a canonical JSON string via `expandCollections` → `canonicalize` → `JSON.stringify`. Property order, `undefined` entries, and Set/Map insertion order all do not affect the result.
- **`detachedCopy<V>(value)`** — Recursively rebuilds plain objects, arrays, Sets, Maps, and Dates. Unwraps Vue proxies via `toRaw`. Map keys are kept by reference (identity-keyed maps must still resolve `.get()`); class instances are also kept by reference.
- **`hasKeyPrefix(key, prefix)`** — Returns `true` when every segment of `prefix` matches the corresponding position in `key` (array-based). Empty prefix matches anything.
- **`matchesAnyPrefix(value, prefixes)`** — Returns `true` when `value` is a string starting with any entry in `prefixes`, or when `prefixes` is empty (matches all). Used to scope "is this busy?" checks.
- **`isNil(value)`** — Type-guard for `null | undefined`.
- **`isPlainObject`** _(internal)_ — Checks for `Object.prototype` or `null` prototype; gates the object branches in `detachedCopy` and `expandCollections`.
- **`expandCollections`** _(internal)_ — Recursively rewrites Set/Map into tagged plain shapes (`{ stableKeyKind: 'Set' | 'Map', … }`) so `canonicalize` can normalise them. Sorts items by `stableKey` to make the result order-independent.

## Relationships

- **`@guebbit/js-toolkit`** (`canonicalize`) — called inside `stableKey` after the `expandCollections` pre-pass.
- **`vue`** (`toRaw`) — called at the top of `detachedCopy` to unwrap reactive proxies before recursing.
- **`src/internal/resourceKeys.ts`, `src/internal/resourceActivity.ts`, `src/internal/scopeRegistry.ts`, `src/internal/queryRecordStore.ts`, `src/internal/recordMutations.ts`, `src/internal/resourceMutations.ts`, `src/internal/restResource.ts`** — import `stableKey`, `detachedCopy`, `hasKeyPrefix`, `matchesAnyPrefix`, and/or `isNil` for identity checks, snapshot isolation, and prefix-based scoping.
- **`src/composables/structureSearchApi.ts`, `src/composables/structureCrudApi.ts`, `src/composables/structureFormValidation.ts`, `src/composables/isLoading.ts`** — consume the same exported helpers.
- **`src/stores/core.ts`** — uses `detachedCopy` / `stableKey` when caching or comparing store payloads.
- **`tests/internal/plainData.property.spec.ts`** — property-based tests for `stableKey` and `detachedCopy` round-tripping.
- **`tests/structureSearchApi/_helpers/seedPages.ts`** — test fixture that exercises `stableKey`-dependent search behaviour.

## Notes

- **Set/Map workaround is temporary.** `expandCollections` exists only because `@guebbit/js-toolkit`'s `canonicalize` walks non-Array, non-Date objects through `Object.keys()`, which is `[]` for both `Set` and `Map` — so without the pre-pass every Set/Map collapses to `{}`. Remove `expandCollections` and call `canonicalize` directly once the upstream release lands (tracked in js-toolkit).
- **`stableKey` sorts Set/Map items** using `stableKey` itself (recursively), so the function is self-referential during collection expansion.
- **`detachedCopy` does not clone class instances** — `structuredClone` would drop prototypes. Replace such instances wholesale rather than mutating them.
- **`expandCollections` uses a `WeakSet` cycle guard** scoped to the current walk path; it does not attempt to produce a correct result for cyclic Set/Map structures (filters are not documented to support those).
