---
source: tests/types/structureSearchApi.test-d.ts
sha256: 0da6583feec540f09cedd92da561f5ffb7d4b0c87cad298ea21bf7d08ef1d634
generated_at: 2026-09-28T23:16:15.249312+00:00
model: ollama:qwen3.8:27b
---

# tests/types/structureSearchApi.test-d.ts

## Purpose

Type-level test file (no runtime assertions) that pins down the public type contract of `useStructureSearchApi`, ensuring the composable's return type, fetch contexts, watcher handle, and settings objects are shaped exactly as documented. It exists to catch unintended signature changes in the search API layer before they reach consumers.

## Key elements

- **`IUserFilters`** – local filter shape (`name?: string`) used as the `TFilters` type parameter to make assertions concrete.
- **`filters` / `search`** – instantiates `useStructureSearchApi<IUser, number, string | number, IUserFilters>` against a reactive ref; every assertion below is made on this instance.
- **Return-type assertion** – `expectTypeOf(search).toEqualTypeOf<IStructureSearchApi<…>>` confirms the composable returns the explicitly exported interface, not an inferred shape.
- **`fetchSearch` assertions** – verifies the resolved payload (`{ items: (IUser | undefined)[]; totalItems: number }`), the `ISearchFetchContext` fields (`filters`, `page`, `pageSize`, `signal`), and that a narrower `IFetchContext` callback is still assignable.
- **`watchSearch` handle assertions** – checks `handle.search()` return type, `handle.stop` signature, and the four positional callback parameters plus their `signal` context.
- **Settings negative tests** – `@ts-expect-error` blocks for `staleTime` (must be `number`, not `string`) and `key` (must be `string[]`, not `string`) on both `watchSearch` and `checkSearch`.
- **`isPageCached` arity test** – `@ts-expect-error` confirms it accepts only settings (no filters/page/pageSize arguments).

## Relationships

- **`src/composables/structureSearchApi.ts`** – source of `IStructureSearchApi` and `ISearchFetchContext` types; the module under test.
- **`src/composables/structureRestApi.ts`** – source of `IFetchContext`; used to verify that the plain REST read-context is assignable wherever the richer search context is expected.
- **`src/index.ts`** – public entry point from which `useStructureSearchApi` is imported, confirming the composable is part of the package's exported API.
- **`tests/types/_fixtures.ts`** – provides the `IUser` interface used as the `T` type parameter throughout the assertions.

## Notes

- `*.test-d.ts` convention: these are type-check-only files (typically run via `vue-tsc` or `tsc --noEmit`), not executed at runtime. The `void` expressions and unused-variable patterns exist solely to satisfy the compiler.
- `IStructureSearchApi` is asserted as an *exact* type (`toEqualTypeOf`), meaning the interface must be explicitly exported and closed—no extra members are permitted.
- The assignability check for `IFetchContext → ISearchFetchContext` relies on function-parameter contravariance; a callback typed on the narrower context can be passed where the wider one is expected.
- `pageItemList.value` is typed `IUser[]` (non-optional elements), while `fetchSearch`'s resolved `items` is `(IUser | undefined)[]`—an intentional distinction in the API surface.
