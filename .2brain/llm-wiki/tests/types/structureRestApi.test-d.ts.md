---
source: tests/types/structureRestApi.test-d.ts
sha256: c4961426227d0deefa7ad6fc3a6017349c96193f1931c1f47ec2e529342bcefd
generated_at: 2026-09-28T23:15:54.135675+00:00
model: ollama:qwen3.8:27b
---

# tests/types/structureRestApi.test-d.ts

## Purpose

Compile-time type test for `useStructureRestApi`. Uses `expect-type` assertions (not runtime assertions) to lock down the public type contract of the composable: return-type inference, per-call argument shapes, required options, and the `IWatchHandle` surface. It exists so that any accidental type regression in the composable's signatures fails at build time rather than at consumer runtime.

## Key elements

- **Top-level `resource` constant** — calls `useStructureRestApi<IUser, number>({ resourceKey: 'users' })` once; every assertion below operates on this single instance.
- **Return-type assertion** — `expectTypeOf(resource).toEqualTypeOf<IStructureRestApi<IUser, number>>()` pins the exported interface.
- **Record inference checks** — verifies `getRecord`, `itemDictionary`, and `itemList` infer `IUser`/`number` correctly.
- **ComputedRef checks** — asserts derived views (`selectedRecord`, `pageTotal`, `pageOffset`, `pageItemList`, `lastInsertedRecord`) are typed as `ComputedRef<T>`, i.e. read-only at the type level.
- **Linking / unlinking** — confirms `removeFromParent` and `removeDuplicateChildren` return `number[]` (child ids).
- **`fetchTarget` / `updateTarget`** — validates the api-call signature, the `Partial<T>` patch constraint, and the `AbortSignal` in the trailing context object.
- **`fetchAll` / `fetchMultiple`** — checks that `apiCall` receives `(ids, context)` in that order for `fetchMultiple`, and that context is optional for `fetchAll`.
- **Watch family (`watchAll`, `watchByParent`, `watchAny`, `watchTarget`)** — asserts `IWatchHandle<T>` shape (`stop`, `refetch`, `suspense`, `error`) and that `watchAny` requires a `key`.
- **Negative assertions (`@ts-expect-error`)** — missing `resourceKey`, wrong id type, non-`Partial` patch, missing `watchAny` key.

## Relationships

- **`src/composables/structureRestApi.ts`** — source of the `IStructureRestApi` and `IWatchHandle` interfaces that this file imports and asserts against.
- **`src/index.ts`** — re-exports `useStructureRestApi`; this file imports from the package root (`../../src/index.js`) to exercise the public entry point.
- **`tests/types/_fixtures.ts`** — supplies the `IUser` entity type used as `T` throughout the assertions.
- **`package.json`** — declares the `expect-type` dev dependency and the TypeScript project configuration that makes `.test-d.ts` files participate in type-checking.

## Notes

- The file is a **type-only** test: it runs under `tsc` (or `vue-tsc`), not under a runtime test runner. No `vitest`/`jest` import is present.
- Every assertion is an `expectTypeOf(...).toEqualTypeOf<...>()` call; there are no `expect(...)` runtime expectations. A type change that compiles but shifts a signature will fail the build.
- The `@ts-expect-error` lines are load-bearing: if the corresponding error *disappears*, the line itself becomes an error, so the file doubles as a guard against accidentally relaxing a constraint (e.g. making `resourceKey` optional).
- `IUser` from `_fixtures.ts` is deliberately minimal (includes `name`) to keep negative-assertion messages readable; swapping in a larger interface would not change what is being tested.
