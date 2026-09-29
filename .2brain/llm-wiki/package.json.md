---
source: package.json
sha256: 875cdf3b2807aa896ffbe8221a55d11ea9c68dc6c7696deae01fd9f1bbd97f3b
generated_at: 2026-09-28T22:28:40.972663+00:00
model: ollama:qwen3.8:27b
---

# package.json

## Purpose

Project manifest for `@guebbit/vue-toolkit` (v5.0.0), an ESM-only npm package that ships Vue 3 composables and Pinia stores for building CRUD screens. It declares the package identity, build/test/publish scripts, dependency contracts, and publish metadata that make the library consumable and verifiable.

## Key elements

- **`type: "module"` / `exports`** — declares the package as ESM-only; the single `"."` export points to `dist/index.js` (runtime) and `dist/types/index.d.ts` (types).
- **`sideEffects: false`** — signals to bundlers that every export is tree-shakeable.
- **`peerDependencies`** — requires consumers to provide `vue ≥3.4`, `pinia ≥2.1`, `@tanstack/vue-query ≥5.103`; `zod ≥4.4.3` is listed but marked **optional** via `peerDependenciesMeta`.
- **`dependencies`** — a single runtime dependency: `@guebbit/js-toolkit`.
- **`devDependencies`** — tooling for build (TypeScript ~6), test (Jest 30, Stryker mutation), lint (ESLint 10 + Prettier + oxlint), docs (VitePress + Mermaid), and publish validation (publint, @arethetypeswrong/cli).
- **`scripts`** — notable entries:
    - `build` — runs `tsc` directly (no bundler).
    - `test:package` — publint → attw (ESM check) → smoke test → DTS guard.
    - `test:mutation` / `test:mutation:incremental` — Stryker mutation testing.
    - `complete` / `complete:check` — full local pipeline (lint → format → build → package test → unit test → type test → docs build).
    - `prepublishOnly` — enforces a clean working tree (`check:clean`) then runs `complete:check` before `npm publish`.
    - `docs:dev` / `docs:build` — VitePress on port 8080.
- **`engines`** — requires Node ≥ 22.
- **`files`** — ships `dist`, `README.md`, `LICENSE`, `CHANGELOG`.
- **`license`** — AGPL-3.0-only.

## Relationships

- **`src/composables/*` and `src/internal/parentRelations.ts`** — the `build` script (`tsc`) compiles these sources into `dist/`, which is the artifact declared under `exports` and `files`.
- **`docs/composables/structure-crud-api.md`, `docs/composables/structure-form-validation.md`, `docs/stores/core.md`, `docs/stores/notifications.md`, `docs/guide/testing.md`** — consumed by the `docs:build` / `docs:dev` scripts via VitePress; `test:package` does not gate on docs, but `complete` does.
- **Peer-dependency contract** — the composables (`structureCrudApi`, `structureRestApi`, `structureFormValidation`, etc.) and stores (`core`, `notifications`) import from `vue`, `pinia`, `@tanstack/vue-query`, and `zod` at the consumer's runtime; `package.json` is the single source of truth for which versions are compatible.
- **`test:target` script** — directly references the `tests/structureRestApi` directory, tying the script to the `src/composables/structureRestApi.ts` neighbor.

## Notes

- The `prebuild` script uses `node -e "require('fs')…"`, which works because `node -e` defaults to CJS evaluation regardless of the package's `"type": "module"` setting.
- `zod` is a peer dependency **and** optional (`peerDependenciesMeta.zod.optional: true`), yet also appears in `devDependencies`. Consumers that don't use the Zod-backed validation composables may omit it; the package will still install and type-check for the non-Zod surface.
- `CHANGELOG` (no file extension) is listed in `files`; if the actual file is `CHANGELOG.md`, it will **not** be published. Verify the filename on disk.
- `@tanstack/vue-query` is pinned to an exact version (`5.104.0`) in `devDependencies` while the peer range is `^5.103` — the dev copy is the version used during type-checking and testing.
- The `complete:check` / `prepublishOnly` chain means a dirty working tree or any lint/type/test failure blocks `npm publish` — there is no `--force` override in the scripts.
