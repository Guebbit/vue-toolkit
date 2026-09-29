---
source: tsconfig.vitest.json
sha256: 7ba7418f61175c266f50362751eac54996a2c15342b79a82ee870c4a58c95a9d
generated_at: 2026-09-28T23:17:18.914272+00:00
model: ollama:qwen3.8:27b
---

# tsconfig.vitest.json

## Purpose

A TypeScript configuration scoped to the test suite. It extends the project's base `tsconfig.json` and relaxes module-resolution rules so that type-aware tooling (linting, IDE diagnostics) resolves test-file imports the same permissive way `ts-jest` transpiles them at runtime.

## Key elements

- **`extends: "./tsconfig.json"`** — inherits all base compiler options, then overrides only what differs.
- **`include`** — limits the project scope to `src/**/*.ts`, `tests/**/*.ts`, and `tests/**/*.tsx`, excluding anything else the base config might pull in.
- **`compilerOptions.types: ["jest", "node"]`** — restricts ambient type packages to Jest and Node, preventing stray global types from leaking into test files.
- **`compilerOptions.module: "ESNext"` / `moduleResolution: "bundler"`** — overrides the base config's `NodeNext` setting so that extensionless relative imports (e.g. `import { x } from '../src/foo'`) resolve without requiring a `.js` suffix.

## Relationships

- **`./tsconfig.json`** — parent config; all unspecified options are inherited from it. This file only narrows scope and adjusts module resolution.
- **`jest.config.cjs`** _(referenced in a comment)_ — the runtime transpilation step (`ts-jest` → CommonJS) that this config's permissive resolution mirrors. No import dependency; the link is semantic (both must agree on how `src/` imports resolve).

## Notes

- The override exists specifically because **test files import `src/` siblings without a `.js` extension**, while the base `NodeNext` resolution would require one. Do not "fix" the test imports to add `.js` to match `NodeNext`—that would break the `ts-jest`/CommonJS pipeline described in `jest.config.cjs`.
- Despite the file name containing "vitest," the `types` array and the comment both reference **Jest**. The naming is a historical/alias choice; the tooling in use is Jest, not Vitest.
