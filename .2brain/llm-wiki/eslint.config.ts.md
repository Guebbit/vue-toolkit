---
source: eslint.config.ts
sha256: edd4cef008c2a90e4a933c1afd47d5c990dad77797e7208186eba4de678b2040
generated_at: 2026-09-28T22:28:14.396905+00:00
model: ollama:qwen3.8:27b
---

# eslint.config.ts

## Purpose

Flat ESLint configuration (ESLint v9+ flat config format) for a Vue 3 + TypeScript project. It composes multiple presets (ESLint recommended, Vue essential, Vue-TS recommended, oxlint recommended, unicorn) and layers project-specific rule overrides on top, enforcing naming conventions, JSDoc discipline, file-naming style, and a set of house-style exceptions documented inline.

## Key elements

- **`defineConfigWithVueTs`** — factory from `@vue/eslint-config-typescript` that wraps the config array and wires up the Vue SFC parser; all config objects are passed as arguments.
- **`globalIgnores([...])`** — excludes `dist/`, `docs/`, `node_modules/`, and the config file itself from linting.
- **Preset stack** — `eslint.configs.recommended`, `pluginVue.configs['flat/essential']`, `vueTsConfigs.recommended`, `pluginOxlint.configs['flat/recommended']`, `pluginUnicorn.configs['flat/recommended']`.
- **Global rules block** — sets `languageOptions` (browser globals, ES-next, module) and a large `rules` map: naming-convention (PascalCase classes, `I`-prefixed interfaces, `E`-prefixed enums, camelCase defaults), unicorn filename-case, catch-error-name, name-replacements, and dozens of individual rule toggles with rationale comments.
- **JSDoc block** (`files: ['src/**/*.ts']`) — registers `eslint-plugin-jsdoc` in TypeScript mode; enforces `require-jsdoc` on public functions/classes/interfaces/types/enums, param/tag name accuracy, and descriptions. `require-param` / `require-returns` are intentionally left off.
- **Component naming override** — `.vue` and `.tsx` files must be `pascalCase` (overriding the global `camelCase` filename-case rule).
- **Test / "special file" overrides** — test files, `*.spec.ts`, `*.test.ts`, `*.d.ts` get relaxed filename-case, name-replacements, and a few unicorn rules turned off.
- **Vitest tsconfig wiring** — test file globs are pointed at `./tsconfig.vitest.json` via `parserOptions.project` with `projectService: false` so type-aware rules resolve types outside the main `src/` build.
- **Commented-out options** — `configureVueProject({ scriptLangs: ['ts','tsx'] })` and `unicorn/string-content` are present but disabled; un-commenting them changes project-wide behavior.

## Relationships

No graph neighbors are recorded for this file. It is a leaf in the dependency graph: it is _consumed_ by the ESLint CLI (`eslint` reads `eslint.config.ts` by convention) and imports only npm packages (`@eslint/js`, `globals`, `eslint-plugin-unicorn`, `eslint/config`, `@vue/eslint-config-typescript`, `eslint-plugin-vue`, `eslint-plugin-oxlint`, `eslint-plugin-jsdoc`).

## Notes

- **Oxlint** is loaded as an ESLint plugin (`eslint-plugin-oxlint`) and contributes rules through the flat-config spread, not as a standalone binary invocation.
- The `unicorn/filename-case` rule is defined **twice**: once globally as `camelCase`, then overridden to `pascalCase` for `.vue`/`.tsx`. The test-file override turns it off entirely.
- Many `unicorn/*` rules are explicitly turned off with a comment explaining the house-style rationale (e.g., promise chaining, boolean option names, single-line JSDoc). These comments are the de-facto "why" and should be preserved when editing the rules block.
- The JSDoc section is scoped to `src/**/*.ts` only; `.vue` files and test files are **not** subject to the JSDoc rules.
- The commented `configureVueProject` line, if enabled, would allow `tsx` script blocks in `.vue` files — a non-trivial project-wide change.
- The Vitest `parserOptions` block uses `projectService: false`, meaning ESLint will _not_ auto-resolve the project service; the explicit `project` array is the only source of type info for test files.
