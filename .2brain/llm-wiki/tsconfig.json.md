---
source: tsconfig.json
sha256: 44bc292f0ab82a701994f9f6761792667a73083b83914315957d88086551781c
generated_at: 2026-09-28T23:16:57.693589+00:00
model: ollama:qwen3.8:27b
---

# tsconfig.json

## Purpose

TypeScript compiler configuration for the project. It defines how `tsc` compiles source files in `src/` into JavaScript and declaration files in `dist/`, and sets the strictness and module-resolution rules that all code in the repo must satisfy.

## Key elements

- **`compilerOptions.strict`** – Enables the full family of strict null-checking and type-safety flags.
- **`noUnusedLocals` / `noUnusedParameters`** – Compiler-enforced unused-variable and unused-parameter errors. (See Notes for why these are on.)
- **`skipLibCheck`** – Skips type-checking of `.d.ts` files under `node_modules`; own source is still fully checked.
- **`target` / `module` / `moduleResolution`** – ES2023 output with `NodeNext` module semantics (ESM + CJS interop via Node's resolver).
- **`esModuleInterop` / `allowSyntheticDefaultImports` / `isolatedModules`** – Enables default imports of CJS packages and requires each file to be independently transpilable.
- **`lib: ["dom", "esnext"]`** – Makes DOM and latest ES APIs available to the type system.
- **`resolveJsonModule`** – Allows `import` of `.json` files with type inference.
- **`rootDir` / `outDir` / `declaration` / `declarationDir`** – Compiles from `src/` → `dist/`, emitting `.d.ts` bundles under `dist/types/` for downstream consumers.
- **`include: ["src"]` / `exclude`** – Only `src/` is compiled; `node_modules` and `dist` are excluded.

## Relationships

No graph neighbors are recorded for this file.

## Notes

- `noUnusedLocals` and `noUnusedParameters` are deliberately set **in the compiler** because the project's ESLint uses the OxLint preset, which turns `no-unused-vars` off at the linter level (OxLint is not run in this repo). Removing either flag from `tsconfig.json` would silently drop the unused-variable check entirely.
- `skipLibCheck` is on specifically because some third-party `.d.ts` files reference dev-only globals (e.g. `vitest`). It does **not** weaken checking of first-party source.
- `isolatedModules` is on, so every file must be valid on its own—re-exports of types need `export type`, and `const enum` / parameter properties are disallowed.
