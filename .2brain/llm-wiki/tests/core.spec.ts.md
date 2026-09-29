---
source: tests/core.spec.ts
sha256: 6e1834a2831b019ea82b07a99e583eda033354ea1afd1354254507b1f8a9e6f9
generated_at: 2026-09-28T22:40:13.963004+00:00
model: ollama:qwen3.8:27b
---

# tests/core.spec.ts

## Purpose

Vitest unit tests for the `useCoreStore` Pinia store, covering its loading-state API: setting/clearing individual keys, resetting all, and the prefix-filtering behavior of `isLoading()`.

## Key elements

- **`describe('useCoreStore', …)`** — single test suite; calls `setActivePinia(createPinia())` in `beforeEach` to get a fresh store per test.
- **Initial-state test** — asserts `isLoading()` returns `false` on a fresh store.
- **Set/get tests** — verify `setLoading(key, true/false)` and `getLoading(key)` round-trip correctly.
- **`resetLoadings()` test** — multiple keys active, then all cleared.
- **Any-active test** — `isLoading()` (no args) is true when at least one key is active.
- **Prefix-filter tests** — `isLoading(prefixes[])` only matches keys that _start_ with one of the given prefixes; demonstrates that:
    - non-matching prefixes are ignored,
    - sub-keys like `accountProfile:avatar-upload` match the `account` prefix,
    - exact-key match works,
    - multiple prefixes are OR-joined,
    - an inactive key under a prefix still yields `false`,
    - prefix matching is anchored to the start of the key (`my-account` ≠ `account`).

## Relationships

- **`src/stores/core.ts`** — the unit under test. The test imports `useCoreStore` and exercises its public methods (`isLoading`, `setLoading`, `getLoading`, `resetLoadings`).
- **`package.json`** — supplies the test runner (Vitest) and the `pinia` dependency used for `createPinia` / `setActivePinia`.

## Notes

- Prefix matching is **left-anchored only** — a prefix like `account` will _not_ match `my-account`. This is explicitly asserted and is a common source of caller confusion.
- `isLoading()` with no argument is a convenience for "any key active"; with a prefix array it narrows the check. Callers must pass prefixes, not full keys, when they want scoped checks (though exact keys also work since they match themselves).
- The store is assumed to be a module-level singleton per Pinia instance; tests rely on `setActivePinia` to isolate each `it` block.
