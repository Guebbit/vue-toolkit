---
source: tests/internal/identifierJoin.spec.ts
sha256: cf80ec5b54272450a544292f57ab923df11a57d25226f864fd8f7788c7c0ddc4
generated_at: 2026-09-28T22:40:27.598507+00:00
model: ollama:qwen3.8:27b
---

# tests/internal/identifierJoin.spec.ts

## Purpose

Unit tests for `joinIdentifiers` that target boundary cases the property-based spec (`tests/structureDataManagement/property.spec.ts`) doesn't reliably reach: literal backslashes in values, single `null`/`undefined` entries, the one-vs-two-value escaping threshold, and multi-character delimiters (including the escape character itself as a delimiter).

## Key elements

- **`describe('UNIT · joinIdentifiers')`** – single top-level suite; all tests are synchronous `expect` assertions against `joinIdentifiers`.
- **Single-value pass-through test** – confirms a one-element array returns the raw value unchanged even if it contains the delimiter.
- **Null / undefined tests** – verify `null` and `undefined` are coerced to `''` both as the sole element and within a multi-element join.
- **Two-value boundary test** – documents that exactly two delimiter-free values join with a plain delimiter (no escaping).
- **Backslash-before-delimiter ordering test** – asserts the escape character (`\`) is doubled _before_ the delimiter is escaped, so `['a\\','b']` → `a\\\\|b` and never collides with `['a','\\b']`.
- **In-value delimiter escaping test** – `['a|b','c']` → `a\|b|c` (delimiter inside a value gets a `\` prefix).
- **`it.each` multi-delimiter collision table** – parameterised over delimiters `--`, `::`, and `\\`; for each, asserts two genuinely different tuples produce different joined strings.

## Relationships

- **Imports** `joinIdentifiers` from `src/internal/identifierJoin.ts` (the only production dependency).
- **Complements** `tests/structureDataManagement/property.spec.ts`, which covers the general "different tuples never collide" property with random generation; this file pins the specific edge cases that random generation may skip.

## Notes

- Escaping order is load-bearing: the backslash must be escaped _before_ the delimiter. The test comment and the `not.toBe` assertion guard against a refactoring that reorders the two steps.
- `String.raw` cannot represent a string ending in a single backslash (the tokenizer treats the trailing `\` as escaping the closing backtick), so those specific assertions use plain `\\` literals with `eslint-disable unicorn/prefer-string-raw`.
- `eslint-disable unicorn/no-null` is used deliberately to exercise the `null` branch; do not "fix" these away.
- The `it.each` table encodes the invariant that escaping is whole-delimiter-aware: a multi-char delimiter like `--` must not be split into two `-` escapes, and when the delimiter _is_ the escape character (`\`), the two mechanisms must still not let distinct tuples collide.
