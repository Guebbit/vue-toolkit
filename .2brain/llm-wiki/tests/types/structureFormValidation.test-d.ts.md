---
source: tests/types/structureFormValidation.test-d.ts
sha256: 02ef6019f19320436b179214f98bbc0b79082da443e4953ad1a6b9af3901a1f6
generated_at: 2026-09-28T23:15:36.225736+00:00
model: ollama:qwen3.8:27b
---

# tests/types/structureFormValidation.test-d.ts

## Purpose

Compile-time type assertions for `useStructureFormValidation`. The file verifies (without runtime execution) that the composable's generic `T` is correctly inferred from `initialData`, that `form` and `formErrors` expose the expected types, and that a zod schema whose shape mismatches `T` is rejected at the type level.

## Key elements

- **`schema`** – A `z.object` defining `{ name: string; age: number }`, used as the second argument to the composable.
- **`form`** – Result of `useStructureFormValidation({ name: '', age: 0 }, schema)`; drives the type assertions below.
- **`expectTypeOf(form.form.value).toEqualTypeOf<{ name: string; age: number }>()`** – Asserts the reactive form state is exactly the inferred data shape.
- **`expectTypeOf(form.formErrors.value).toEqualTypeOf<Partial<Record<'name' | 'age', string[]>>>()`** – Asserts per-field error arrays are optional and keyed by field name.
- **`@ts-expect-error` block** – Confirms that passing a schema where `name` is `z.number()` (mismatching `initialData`) produces a compile-time error, locking in the "schema must conform to `T`" contract.

## Relationships

- **`src/index.ts`** – The composable is imported from this barrel (`../../src/index.js`), so this test exercises the public API surface rather than the internal module path.
- **`src/composables/structureFormValidation.ts`** – The implementation under test; the generic signature `useStructureFormValidation<T>(initialData: T, schema: Z)` (or equivalent) is what the assertions and the `@ts-expect-error` case validate.
- **`package.json`** – Provides the `zod` and `expect-type` dev dependencies required to compile this file, and (presumably) the `tsd` / type-test runner script that executes `.test-d.ts` files.

## Notes

- The `.test-d.ts` extension signals a **type-only** test; it is never executed at runtime. It is compiled (typically via `tsd` or `tsc --noEmit`) and the only "pass/fail" signal is whether the type assertions and the `@ts-expect-error` hold.
- `@ts-expect-error` fails compilation if the expression does *not* error, so it doubles as a guard against accidentally loosening the schema-conformance constraint.
- The import path uses the `.js` extension (`../../src/index.js`), consistent with ESM / NodeNext resolution in the project.
