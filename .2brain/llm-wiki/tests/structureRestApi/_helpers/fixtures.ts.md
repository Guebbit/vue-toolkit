---
source: tests/structureRestApi/_helpers/fixtures.ts
sha256: 65fb7530206655fdbd1df26ce6d6a78f954b843fefc53fa6de1c9e80892b90a3
generated_at: 2026-09-28T22:47:42.902917+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/_helpers/fixtures.ts

## Purpose

Shared type definitions and entity-factory helpers for the `structureRestApi` integration test suite. Exists as a plain (non-spec) module so Jest's `testMatch` pattern skips it, while giving every spec a consistent, predictable set of fixture data to build assertions against.

## Key elements

- **`IUser`, `IProduct`, `IArticle`** — Typed interfaces for the three entity shapes the API endpoints accept/return. Each includes the required fields plus optional ones (`role`, `bio`, `price`, `tag`).
- **`buildUsers(count, startId?)`** — Returns an array of `count` users with sequential IDs, defaulting to IDs 1…N.
- **`buildProducts(count, startId?)`** — Returns `count` products; `price` is derived as `id × 10`.
- **`buildArticles(count, category?, startId?)`** — Returns `count` articles in a single category (default `'tech'`).
- **`USERS`** — A fixed three-element array (Alice / Bob / Carol) used as the canonical "small dataset" across many specs.
- **`FULL_USER`** — A single `IUser` with every optional field (`role`, `bio`) populated; intended for merge/replace/invalidation assertions.

## Relationships

- Imported by every spec under `tests/structureRestApi/` (`effects/loading-per-method`, `effects/loading-stability`, `intention/*`, `lifecycle/*`) to obtain the entity types, factory functions, and the `USERS` / `FULL_USER` constants.
- Listed as a graph neighbor of `tests/browser/focus-online.spec.ts`, `tests/browser/gc.spec.ts`, and `tests/browser/plugin.spec.ts`; the exact nature of that edge (shared transitive dependency vs. direct import) is not visible from this file alone.

## Notes

- IDs are always **1-based** (`startId` defaults to 1). Tests that reference "user 0" are a red flag — no factory produces ID 0.
- `FULL_USER` has `id: 1` and the same name/email as `USERS[0]`, so it can be treated as an "expanded" version of Alice. This matters for specs that compare patch/replace payloads.
- The file deliberately exports **values** (arrays, objects) alongside **factories** (functions). Prefer `buildUsers(n)` when the spec needs a _different_ cardinality; prefer the constants when the assertion depends on specific names/emails.
- No side effects, no imports of application code — safe to import in any test file without triggering module-level setup.
