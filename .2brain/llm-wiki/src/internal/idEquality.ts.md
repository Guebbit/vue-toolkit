---
source: src/internal/idEquality.ts
sha256: 6db79388509cd6d3a12725b8336d629c74280d90b4e50a0fd02f37b053300e00
generated_at: 2026-09-28T22:32:40.638975+00:00
model: ollama:qwen3.8:27b
---

# src/internal/idEquality.ts

## Purpose

Defines the project's canonical notion of "same record id" and provides a deduplication helper built on it. The rule mirrors JavaScript object-key semantics: a number and its string form are one id (because `obj[1]` and `obj['1']` hit the same slot, and route params arrive as strings), while a symbol is only equal to itself. Centralizing this logic ensures every part of the system agrees on what "same id" means.

## Key elements

- **`sameId(one, other)`** (exported) — Returns `true` when two `PropertyKey` values occupy the same object key (number ↔ its string form; symbol ↔ itself).
- **`uniqueIds(ids)`** (exported) — Returns a new array with duplicates removed (per `sameId`), preserving first-seen order.
- **`keyOf(id)`** (module-private) — Normalizes a `PropertyKey` to its canonical key: `String(id)` for strings/numbers, the symbol itself for symbols.

## Relationships

- **`src/internal/parentRelations.ts`** — Relation stores use `sameId` when linking, unlinking, and de-duplicating child ids so those operations agree with the dictionary the records are stored in.
- **`src/composables/structureDataManagement.ts`** — Consumes `sameId`/`uniqueIds` when managing structural data that carries record ids.

## Notes

- The equality is intentionally _not_ `===`; `1` and `'1'` are treated as identical, which is the whole point of the module.
- `uniqueIds` is generic (`<K extends PropertyKey>`) so it works with `string[]`, `number[]`, or mixed arrays without widening.
- The file exports no classes or side effects; it is a pure-utility module safe to import anywhere.
