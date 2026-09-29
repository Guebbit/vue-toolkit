---
source: tests/types/structureDataManagement.test-d.ts
sha256: 5e8705269efe6ae725caab688edd7a70d770f5a28db720c38b697b7d72c7f562
generated_at: 2026-09-28T23:15:23.426788+00:00
model: ollama:qwen3.8:27b
---

# tests/types/structureDataManagement.test-d.ts

## Purpose

Compile-time type test (no runtime assertions) that verifies the generic type contracts of `useStructureDataManagement`: the `K` type-parameter default and explicit overrides, the shape of the returned `IStructureDataManagementApi`, and the required-vs-optional member split in the `IRecordStore` / `IRelationStore` injection interfaces.

## Key elements

- **`expectTypeOf` / `toEqualTypeOf` assertions** — from the `expect-type` library; each checks a specific generic inference at compile time.
- **`TIdOf<T>` coverage** — confirms that when `T` has an `id` field the key type is that field's type (`number` for `IUser`); when it does not (e.g. `ISlugged`), the fallback is `string | number`.
- **Composite-`K` block** — instantiates `useStructureDataManagement<IUser, string>(…)`, asserting `getRecord` accepts `string` and rejects `number`.
- **`IRecordStore` minimal-store block** — a 5-member object (`dictionary`, `write`, `remove`, `writeAll`, `clear`) is accepted as a valid 3rd-arg store; a 4-member object (missing `write`) is rejected via `@ts-expect-error`. This documents that `resolve`, `read`, and `isFetching` are optional.
- **`IRelationStore` minimal-store block** — a 4-member object (`dictionary`, `addToParent`, `removeFromParent`, `removeDuplicateChildren`) is the complete required surface; no member is optional.
- **`@ts-expect-error` negative assertions** — three instances confirm that incorrect key types (string key where `number` is expected, `number` where composite `string` is expected, missing required `write`) produce type errors.

## Relationships

- **`src/composables/structureDataManagement.ts`** — source of `useStructureDataManagement`, `IStructureDataManagementApi`, `IRecordStore`, `IRelationStore`, and `TIdOf`. All type assertions target declarations from this file.
- **`src/index.ts`** — the barrel re-export through which the test imports `useStructureDataManagement` (mirrors how a consumer would import it).
- **`tests/types/_fixtures.ts`** — provides the `IUser` interface used as the primary `T` throughout the assertions.
- **`package.json`** — declares the `expect-type` and `vue` dependencies used by this file.

## Notes

- This file is a `.test-d.ts` type-test; it is never executed at runtime. CI (or the type-checker) evaluates it during `tsc` / `vue-tsc` passes.
- Imports use the `.js` extension on relative paths, consistent with the project's ESM `"type": "module"` setup.
- The `ISlugged` and `minimalRecordStore` / `incompleteRecordStore` / `minimalRelationStore` declarations are file-local and exist solely to drive the type assertions—do not treat them as shared fixtures.
