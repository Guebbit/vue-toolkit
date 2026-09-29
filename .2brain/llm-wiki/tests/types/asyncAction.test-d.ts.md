---
source: tests/types/asyncAction.test-d.ts
sha256: 7975f7c76fc61b094ecf69c4ef01adc13f3b8de58dad955efaec596352f3ff50
generated_at: 2026-09-28T23:14:11.408958+00:00
model: ollama:qwen3.8:27b
---

# tests/types/asyncAction.test-d.ts

## Purpose

Type-level test (`.test-d.ts`) that verifies `useAsyncAction` correctly infers its `data` type and `run` signature from the wrapped action's parameters and return type. It ensures the generic plumbing of the composable is preserved through the public API.

## Key elements

- **Type assertions via `expectTypeOf`** — three positive checks:
  - `action.data.value` is `IUser | undefined` (the Ref is initially empty).
  - `action.run`'s first parameter is `number` (inherited from the wrapped action).
  - `action.run` returns `Promise<IUser | undefined>`.
- **`@ts-expect-error` negative check** — passing a `string` to `action.run` must fail compilation, confirming the parameter type is not widened to `any` or `unknown`.

## Relationships

- **`src/composables/asyncAction.ts`** — the implementation under test; this file exercises its generic signature.
- **`src/index.ts`** — the public barrel; `useAsyncAction` is imported from here (not the composable file directly), so this test also guards against a missing re-export.
- **`tests/types/_fixtures.ts`** — supplies the `IUser` interface used as the return type of the test action.

## Notes

- The `@ts-expect-error` line doubles as a *negative* type test: if someone accidentally types `run`'s parameter as `any`, this line stops producing an error and the build fails (the directive becomes "unused").
- `data.value` includes `undefined` in its union because the underlying `Ref` is initialized before the first `run` call; this is intentional and asserted explicitly.
