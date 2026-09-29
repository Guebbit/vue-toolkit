---
source: src/composables/structureFormValidation.ts
sha256: ccacdf59033f52eb0bde7324d13ec94a56513ba514688ba7a01dd5eeff82ab45
generated_at: 2026-09-28T22:30:47.476046+00:00
model: ollama:qwen3.8:27b
---

# src/composables/structureFormValidation.ts

## Purpose

A Vue 3 composable that manages reactive form state (`form` / `formErrors` refs), optional Zod validation via a structurally-typed `safeParse` contract, and a submit flow with server-error normalization. It exists so that forms in the toolkit get consistent validation, error display, locale re-translation, and server-rejection handling without each app reimplementing the glue.

## Key elements

- **`IValidationSchema<T>`** – Structural interface matching Zod's `safeParse` return shape. Lets any real Zod schema satisfy it without the package ever importing Zod types.
- **`IStructureFormValidationOptions<T>`** – Options: `revalidateOn` (watch source, e.g. locale), `formElement`, `invalidFieldSelector`, `onInvalid` callback.
- **`IApplyServerErrorsOptions<T>`** – `map` (server→form field rename) and `onUnmapped` (catch-all for unattached messages).
- **`IStructureFormValidation<T>`** – Explicit return-type interface: `form`, `formErrors`, `formLevelErrors`, `showFormErrors`, `isSubmitting`, `isValid`, `isDirty`, plus methods `setForm`, `resetForm`, `setInitialData`, `activateAutoHydrate`, `clearErrors`, `applyServerErrors`, `revealErrors`, `handleSubmit`, etc.
- **`DEFAULT_INVALID_FIELD_SELECTOR`** – `[aria-invalid="true"]`; used by `revealErrors` to focus the first bad field.
- **`normalizeServerErrors` / `findErrorCollection` / `readEntryField` / `asMessages`** – Internal helpers that flatten a wide range of API rejection shapes (field-map, object-list, string-list, axios `.response.data`, Zod-style `issues`) into a uniform `IServerErrorEntry[]`.
- **`IValidationIssue`** – Mirrors Zod's `ZodIssue` (path + message) so the composable never references Zod's own types.

## Relationships

- **`src/internal/plainData.ts`** – Imports `detachedCopy` (used by `setInitialData` / `setForm` to deep-clone baseline data) and `stableKey` (used to derive stable keys for error lists).
- **`src/index.ts`** – Public entry point; re-exports `useStructureFormValidation` and its type interfaces so consumers import from the package root.
- **`tests/structureFormValidation.spec.ts`** – Unit tests for validation, dirty tracking, submit flow, and `revealErrors` DOM focus.
- **`tests/structureFormValidation.serverErrors.spec.ts`** – Exercises `applyServerErrors` across the supported API shapes (express-validator, Zod, field-map, axios).
- **`tests/types/structureFormValidation.test-d.ts`** – Compile-time assertions that the public type surface (especially `IValidationSchema`) is satisfiable by real Zod schemas and that no Zod types leak into `.d.ts`.
- **`package.json`** – Declares `zod` as an **optional** peer dependency; `vue` as a peer.

## Notes

- **Zod is never imported.** The composable describes Zod's contract structurally (`IValidationSchema`), so an app without Zod installed still type-checks. Any `z.object({...})` satisfies the interface directly—no wrapper needed.
- **Explicit return type, not `ReturnType<...>`.** `IStructureFormValidation` is written out as an interface because the inferred type reaches into `@vue/reactivity` / `@vue/shared` internals that fail to resolve under a strict (pnpm) `node_modules` layout.
- **Top-level key collapse.** Both Zod nested-path issues and server-error paths are reduced to their root key. `formErrors` is always keyed by the top-level field name; sub-path detail is lost by design.
- **`revalidateOn` fires only while errors are visible.** A pristine form will not turn red on a locale switch.
- **`revealErrors` is DOM-optional.** Omitting `formElement` makes it a pure state change (sets `showFormErrors`), which is what SSR and node-based tests need.
- **`ownValue` uses `Object.hasOwn`** to guard against prototype-chain reads (`constructor`, `toString`) when normalizing server payloads.
