---
source: tests/structureFormValidation.spec.ts
sha256: a2773e7d14ec4abda78d4c6b8cca3fefa180f9b0f89c7c9c683f2378490bcbf0
generated_at: 2026-09-28T22:46:53.070978+00:00
model: ollama:qwen3.8:27b
---

# tests/structureFormValidation.spec.ts

## Purpose

Jest test suite for the `useStructureFormValidation` composable. It verifies reactive form state management, schema-based validation, deep-copy/detachment semantics for nested structures (plain objects, `Set`, `Map`), auto-hydration from an async source ref, and dirty-tracking — ensuring the composable never leaks shared object references between the caller, the baseline, and the live form.

## Key elements

- **`ILoginForm` / `IProfileForm` / `IScheduleForm`** — typed fixture interfaces covering flat strings, a nested plain object (`address.city`), and non-plain reactive collections (`Set`, `Map`).
- **`loginSchema` / `localizedSchema`** — Zod schemas; `localizedSchema` exercises Zod's thunk-based error messages.
- **`schedule()`** — factory returning a fresh `IScheduleForm` (one tag, one limit) for isolation.
- **`pendingHandler()`** — returns a `{ handler, finish }` pair backed by `Promise.withResolvers` so a test can hold a submit open and resolve it manually (overlapping-submit tests).
- **`createForm(field?)`** — minimal form-element stub exposing only `querySelector` (a `jest.fn()`), matching the composable's sole DOM interaction.
- **`inScope(build)` / `make(...)`** — run composable construction inside the test's `effectScope` so watchers stop deterministically in `afterEach`.
- **`describe` blocks** — grouped by composable surface: `form` ref, `setForm`, `resetForm`, `setInitialData`, nested-field detachment, `activateAutoHydrate`, `isDirty`, and (truncated) validation / submit / focus behaviour.

## Relationships

- **`src/composables/structureFormValidation.ts`** — the module under test; every assertion exercises its public API (`form`, `setForm`, `resetForm`, `setInitialData`, `setFieldError`, `formErrors`, `isDirty`, `activateAutoHydrate`, `submit`, `fieldError`, focus-on-error).
- **`package.json`** — provides the Jest runner, `zod`, `vue` (reactivity primitives: `effectScope`, `ref`, `readonly`, `nextTick`), and `Promise.withResolvers` polyfill/target that the tests depend on.

## Notes

- Every composable instance is created inside a per-test `effectScope` that is stopped in `afterEach`; tests must not leak watchers across cases.
- Detachment tests mutate the **source object after** handing it to the composable to prove no shared references remain — a shallow `Object.assign` or spread would fail them.
- `Set`/`Map` detachment is tested because Vue proxies them inside a reactive ref (in-place `add`/`set` is a real UI path). `Date` is intentionally excluded: Vue does not proxy `Date`, so no in-place edit path exists.
- `isDirty` uses a `stableKey` comparison rather than `JSON.stringify`, which would serialize any `Set` as `{}` and miss edits.
- The `readonly` hydration test confirms that `setInitialData` strips Vue's read-only proxy so subsequent writes to nested fields are not silently blocked.
