---
source: tests/package/dtsGuard.mjs
sha256: 9273a432d0d6f483d80bed035ffa97a28b0ae46cee1aca968f99709f43d7d99c
generated_at: 2026-09-28T22:43:27.443038+00:00
model: ollama:qwen3.8:27b
---

# tests/package/dtsGuard.mjs

## Purpose

A standalone guard script that scans every published `.d.ts` file under `dist/types/` and fails the build if a forbidden module is imported. It exists because two failure modes are invisible at publish time: `zod` (an optional peer) and `@vue/reactivity`/`@vue/shared` (Vue internals) can silently break a consumer's type-check, and `internal/` modules leaking into the public surface breaks the API contract.

## Key elements

- **`ALWAYS_FORBIDDEN`** — Regex rules applied to _every_ `.d.ts` (including `internal/`). Currently bans any import of `zod` (static or dynamic `import()`).
- **`PUBLIC_SURFACE_FORBIDDEN`** — Additional rules applied only to files **outside** `internal/`. Bans imports of `@vue/reactivity`, `@vue/shared`, and any relative path containing `/internal/`.
- **Main scan loop** — Recursively lists `dist/types/`, reads each `.d.ts`, tests it against the applicable rule set, and collects offenders.
- **Exit behaviour** — On any violation prints each offending path + reason to `stderr` and calls `process.exit(1)`; otherwise logs an OK message to `stdout`.

## Relationships

No graph neighbors are recorded. The script's only input is the **build output** directory `dist/types/` (resolved relative to the repo root via `import.meta.url`). It is invoked as a standalone Node script (`#!/usr/bin/env node`, top-level `await`), typically wired into a `prepublishOnly` / `prepack` / CI step rather than imported by other code.

## Notes

- `internal/**` files are **exempt** from `PUBLIC_SURFACE_FORBIDDEN` — they may freely reference Vue internals and each other. Only the `zod` rule applies to them.
- The regexes match both `from '…'` and `import('…')` forms but **do not** catch `require('…')` or type-only `import type { … } from '…'` that lack the `from`/`import(` keyword in the expected shape. If a new import syntax sneaks in, it will not be flagged.
- The script uses top-level `await` with `node:fs/promises`; it requires a Node version that supports it (≥ 14.8 for ESM top-level await, or a `.mjs` extension as here).
- Relative path computation uses `entry.parentPath.slice(distTypesRoot.length + 1)` — this assumes `distTypesRoot` has no trailing slash (guaranteed by `fileURLToPath`). A path-change in `dist` layout would silently shift the prefix.
- Because it is a script (not a Jest/Vitest test), it has no test-framework reporter; it only `console.error`s and sets the exit code.
