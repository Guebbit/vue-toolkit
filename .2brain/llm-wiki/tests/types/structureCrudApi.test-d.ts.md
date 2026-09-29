---
source: tests/types/structureCrudApi.test-d.ts
sha256: fe31efd427f7157892f2cd18f6c3f447ce9c217934debf34997a179992af7233
generated_at: 2026-09-28T23:15:07.135286+00:00
model: ollama:qwen3.8:27b
---

# tests/types/structureCrudApi.test-d.ts

## Purpose

Compile-time type test (no runtime assertions) that pins down the public type contract of `useStructureCrudApi`. It verifies the required-ness of `operations` and `settings`, the distinct context argument types for read vs. write operations, the explicit `IStructureCrudApi` return interface, and the settings-object shape of the generated `createOne`/`updateOne`/`deleteOne` methods.

## Key elements

- **Read-operation context checks** — `list`, `get`, `search` callbacks are asserted to receive `IFetchContext` as their last argument via `expectTypeOf(...).toEqualTypeOf<IFetchContext>()`.
- **Write-operation options checks** — `create` (and by symmetry `update`/`remove`) receive an `options` parameter typed `unknown` by default, or a user-supplied settings type when the 6th generic is provided.
- **Negative type assertions (`@ts-expect-error`)** — confirm that swapping a write `options` into a read callback, omitting `operations`, or omitting `settings` all fail compilation.
- **Return-type pinning** — `crud` is asserted to equal `IStructureCrudApi<IUser, number>`, guaranteeing the interface is explicitly exported rather than inferred.
- **Settings-object shape (6-generic variant)** — with `IRequestOptions` as the 6th type parameter, `createOne`/`deleteOne` require `{ requestOptions }`, and `updateOne` accepts `merge`/`applyResponse`/`key`. A bare `{ signal }` argument is rejected.
- **`IUser` fixture** — imported from `_fixtures.ts` solely as a concrete entity type for the generic parameters.

## Relationships

- **`src/composables/structureCrudApi.ts`** — the module under test; supplies `useStructureCrudApi` and the `IStructureCrudApi` interface that this file asserts against.
- **`src/composables/structureRestApi.ts`** — source of the `IFetchContext` type, which the read-operation signatures must accept.
- **`src/index.ts`** — the public re-export entry point from which `useStructureCrudApi` is imported (verifies the barrel export is typed correctly).
- **`tests/types/_fixtures.ts`** — provides the `IUser` interface used as the entity generic in every call in this file.

## Notes

- File extension `.test-d.ts` signals a **type-only** test: it must be run through `tsc` / `tsd`-style checking, not a runtime test runner. No values are executed.
- The critical invariant enforced throughout: **read and write context parameters are not interchangeable**. A read callback's second argument is always `IFetchContext`; a write callback's second argument is always an options/settings object. Mixing them is a compile error.
- When the 6th generic (settings type) is supplied, the generated write methods (`createOne`, etc.) wrap per-call configuration in a single settings object (`{ requestOptions, dummyData, … }`) rather than accepting a bare options argument. Passing a bare `{ signal }` is explicitly rejected.
- `expect-type`'s `toEqualTypeOf` is a structural bidirectional check; it catches both missing and extra properties, making these assertions stricter than a plain assignment check.
