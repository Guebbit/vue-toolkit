---
source: tests/types/uploadProgress.test-d.ts
sha256: 06a649441195d572120e03dcce4bb1f6bfa3e4464f8be9f3e718e24e473876f9
generated_at: 2026-09-28T23:16:27.991755+00:00
model: ollama:qwen3.8:27b
---

# tests/types/uploadProgress.test-d.ts

## Purpose

Compile-time type tests (via `expect-type`) that verify the generic flow of `useUploadProgress`: the `TOptions` type parameter inferred from the `buildOptions` callback must propagate correctly to both `track`'s parameter type and `progress.value`'s runtime shape, while rejecting arbitrary shapes at the type level.

## Key elements

- **`IRequestOptions`** — A local interface (`onUploadProgress: (fraction: number) => void`) used as the concrete `TOptions` generic argument for the test.
- **`upload`** — The result of `useUploadProgress<IRequestOptions>(buildFn)`, where the build function maps an injected `onProgress` callback onto `IRequestOptions`.
- **`expectTypeOf(upload.progress.value)`** — Asserts the reactive `progress.value` resolves to `number | undefined`.
- **`expectTypeOf(upload.track).parameter(0).parameter(0)`** — Asserts `track`'s first argument (the request options) is typed as `IRequestOptions | undefined`.
- **`@ts-expect-error` on `upload.track`** — Negative test: passing a non-`IRequestOptions` shape (`{ wrongShape: true }`) must be a type error.

## Relationships

- **`src/composables/uploadProgress.ts`** — The implementation under test. This file exercises its generic signature (`useUploadProgress<TOptions>(buildOptions: (onProgress) => TOptions)`) purely at the type level.
- **`src/index.ts`** — The public barrel re-export from which `useUploadProgress` is imported here; the test validates the exported surface consumers actually see.

## Notes

- The file is a **type-only** test (`.test-d.ts`); it produces no runtime assertions and is not executed by a test runner. It is checked by the TypeScript compiler (or `tsd`/`ts-expect` tooling) during `tsc`/type-check steps.
- The generic `IRequestOptions` is defined locally and intentionally *not* exported, keeping the test self-contained.
- The `@ts-expect-error` line is load-bearing: removing the `@ts-expect-error` comment would cause a compile failure, so the compiler enforces the negative case.
