---
source: tests/types/isLoading.test-d.ts
sha256: 3e9c7f57e4e9418ad537349f13f460d1fe4eb4ffbb1b3a28ebca566d3ca64541
generated_at: 2026-09-28T23:14:20.099652+00:00
model: ollama:qwen3.8:27b
---

# tests/types/isLoading.test-d.ts

## Purpose

Type-level test (via `expect-type`) that pins down the public type contract of `useIsLoading`. It exists to prevent regressions in the inferred return type or parameter types without needing a runtime test, since the composable's type surface is intentionally minimal.

## Key elements

- **`expectTypeOf(useIsLoading()).toEqualTypeOf<ComputedRef<boolean>>()`** — asserts the no-argument call returns a plain `ComputedRef<boolean>`.
- **`expectTypeOf(useIsLoading(['account'])).toEqualTypeOf<ComputedRef<boolean>>()`** — asserts that supplying a key array does *not* change the return type (no key-tracking type surface).
- **`expectTypeOf(useIsLoading).parameter(1).toEqualTypeOf<QueryClient | undefined>()`** — asserts the second parameter accepts an optional `QueryClient`.
- **`// @ts-expect-error` on `useIsLoading('account')`** — asserts that a bare string (instead of a string array) is rejected at the type level.

## Relationships

- **`src/composables/isLoading.ts`** — the implementation under test; this file does not import it directly but exercises its exported type via the public API.
- **`src/index.ts`** — the barrel module from which `useIsLoading` is imported; this file depends on the named export being re-exported there.

## Notes

- The `@ts-expect-error` line is load-bearing: if the parameter type were loosened to accept `string | string[]`, the test would *fail* (the error directive would be unsatisfied). Keep it in sync with any signature change.
- This file is a `.test-d.ts` (type test) and is expected to be checked by `tsd` or an equivalent, not executed at runtime.
