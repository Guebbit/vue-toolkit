---
source: tests/structureFormValidation.serverErrors.spec.ts
sha256: fd2cad08947ab14a9690e5cc2e8bc7afde26833079aafb12ad875b116734c737
generated_at: 2026-09-28T22:46:37.464562+00:00
model: ollama:qwen3.8:27b
---

# tests/structureFormValidation.serverErrors.spec.ts

## Purpose

Black-box tests for the server-error normalization logic inside `useStructureFormValidation`. Every assertion goes through the public `applyServerErrors` entry point (the normalizer itself is internal) to pin down how a rejected payload is split into per-field errors, form-level messages, and the boolean "did anything apply?" result.

## Key elements

- **`IContactForm` / `INITIAL_CONTACT`** – Minimal two-field model (`email`, `other`) used as the generic parameter and initial state for every test.
- **`listOf(entry)`** – Wraps a single entry in the `{ errors: [entry] }` shape so the list path is exercised.
- **`apply(error, options?)`** – Core helper: creates a fresh composable instance inside the test's `EffectScope`, calls `applyServerErrors`, and returns `{ result, fields, level }` in one object for easy `toEqual` comparisons.
- **`scope: EffectScope`** – Created in `beforeEach`, stopped in `afterEach`; ensures the composable's internal watchers are torn down between tests.
- **`describe` blocks** – Organised by concern: field-probe order (`field`/`name`/`param`), `path` handling, message validation, collection shapes (list vs. map vs. junk), and the `onUnmapped` callback.

## Relationships

- **`src/composables/structureFormValidation.ts`** – The system under test. The spec imports `useStructureFormValidation` and drives its `applyServerErrors`, `formErrors`, `formLevelErrors`, and `setFieldError` APIs.
- **`package.json`** – Provides the Jest/Vitest runner and the `eslint` config (the file carries an inline `unicorn/no-null` disable).

## Notes

- The file intentionally exercises `null`, `undefined`, numbers, and other "junk" payloads; the `eslint-disable unicorn/no-null` at the top is deliberate, not accidental.
- Field-resolution order is **`field` → `name` → `param`**; an empty or non-string value in a slot falls through to the next slot. If none resolve, the entry is treated as form-level.
- An entry with an empty or non-string `message` (and no `msg` fallback) is **dropped entirely**, causing `result: false` even if a valid `field` key was present.
- `onUnmapped` receives **all** unmapped messages (form-level strings + entries whose field name didn't match a real form field) in a single call, and is **not** called when the errors list is empty.
- `formErrors` is a reactive ref; the "leaves formErrors untouched when nothing applied" test asserts referential equality (`toBe`) to confirm no new object is allocated.
