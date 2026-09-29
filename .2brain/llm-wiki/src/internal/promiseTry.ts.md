---
source: src/internal/promiseTry.ts
sha256: 5047b2d306c0be6924ce9fd33a72842efece5d0618e1ca3a849cfc32e77d2e66
generated_at: 2026-09-28T22:33:46.165666+00:00
model: ollama:qwen3.8:27b
---

# src/internal/promiseTry.ts

## Purpose

Provides a minimal polyfill for the ES2025 `Promise.try` API: it runs a callback synchronously inside a `Promise` executor so that any synchronous throw is converted into a promise rejection rather than escaping the caller's stack frame.

## Key elements

- **`promiseTry<T>(function_: () => T | Promise<T>): Promise<T>`** — The sole export. Invokes `function_` immediately; the returned promise resolves with the callback's return value (or resolves with the inner promise's settlement if the callback returns one), or rejects if the callback throws synchronously.

## Relationships

- **`src/composables/asyncAction.ts`** — Consumes `promiseTry` to safely wrap synchronous logic inside async composables.
- **`src/composables/livenessProbe.ts`** — Consumes `promiseTry` to convert probe setup errors into a catchable rejection.
- **`src/composables/uploadProgress.ts`** — Consumes `promiseTry` for the same synchronous-to-rejection guard.

## Notes

- Parameter is named `function_` (trailing underscore) to avoid shadowing the global `Function` constructor.
- This is a deliberate, temporary polyfill: the module docblock notes that Node's `engines` floor (≥ 22) predates native `Promise.try`. Replace with the built-in once the engines floor is raised.
