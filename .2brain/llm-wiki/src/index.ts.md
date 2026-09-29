---
source: src/index.ts
sha256: 2a3d47bae18c0a9865aaf886b9ce623446739f7e833407d40a7824b8693ffd07
generated_at: 2026-09-28T22:32:10.019745+00:00
model: ollama:qwen3.8:27b
---

# src/index.ts

## Purpose

Package entry point (barrel file) that re-exports every public store and composable. It defines the public API surface under semver; anything not re-exported here (e.g. code under `src/internal/`) is internal and not covered by version guarantees.

## Key elements

- `export * from './stores/core.js'` — re-exports the core store.
- `export * from './stores/notifications.js'` — re-exports the notifications store.
- `export * from './composables/structureDataManagement.js'`
- `export * from './composables/structureRestApi.js'`
- `export * from './composables/structureSearchApi.js'`
- `export * from './composables/structureFormValidation.js'`
- `export * from './composables/structureCrudApi.js'`
- `export * from './composables/uploadProgress.js'`
- `export * from './composables/asyncAction.js'`
- `export * from './composables/livenessProbe.js'`
- `export * from './composables/isLoading.js'`

The file contains no logic of its own — only re-export statements.

## Relationships

- **Consumes** (re-exports from): `src/stores/core.ts`, `src/stores/notifications.ts`, and every composable listed above.
- **Documented by**: `docs/stores/core.md` and `docs/stores/notifications.md` describe the API this file surfaces; `docs/guide/testing.md` references the package entry point for test setup.
- **Tested by**: `tests/package/smoke.mjs` imports from this entry to verify the public surface is intact.

## Notes

- **Public API boundary**: Adding a new `export *` line here makes that module's exports a semver-guaranteed public API. Removing or renaming an export here is a breaking change.
- **Internal exclusion**: Code under `src/internal/` is intentionally _not_ re-exported. Do not add it here.
- **`.js` extensions**: Import specifiers use `.js` even though the source files are `.ts` — this is the ESM/Node resolution convention and should be preserved when adding new re-exports.
- **No side effects**: This file has no executable logic, only re-exports. It is safe to import for its types alone.
