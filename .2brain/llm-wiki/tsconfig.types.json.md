---
source: tsconfig.types.json
sha256: 9621a07ae054a6dfdfdf55804388e6384f6ee58ea870599bac2afde9aee8c1b9
generated_at: 2026-09-28T23:17:08.251271+00:00
model: ollama:qwen3.8:27b
---

# tsconfig.types.json

## Purpose

TypeScript configuration for a type-checking-only program. It inherits the project's base `tsconfig.json` and widens the included file set to cover type tests under `tests/types`, without ever producing build output.

## Key elements

- **`extends: "./tsconfig.json"`** — pulls in all compiler options from the base config as defaults.
- **`noEmit: true`** — this config is for checking only; no `.js`/`.d.ts` files are written.
- **`rootDir: "."`** — overrides the base config's `src`-only `rootDir` so that files in `tests/types` are also within the compilation root.
- **`include: ["src", "tests/types"]`** — the set of files this program type-checks.

## Relationships

- **Extends `./tsconfig.json`** — all options not explicitly overridden here (e.g. `declaration`, `declarationDir`, `target`, `module`, etc.) are inherited from that file.

## Notes

- `declaration` / `declarationDir` are inherited from the base config but have no effect because `noEmit` suppresses all output. They are left as-is rather than explicitly cleared.
- The `rootDir` override is the non-obvious part: without it, including `tests/types` would violate the base `rootDir: "src"` constraint and produce a TS6059 error.
