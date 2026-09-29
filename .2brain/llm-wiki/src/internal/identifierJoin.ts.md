---
source: src/internal/identifierJoin.ts
sha256: a21857fb7f35d995711849fa6019476741f069d2ca6412496e01ef34fb941e54
generated_at: 2026-09-28T22:32:55.303800+00:00
model: ollama:qwen3.8:27b
---

# src/internal/identifierJoin.ts

## Purpose

Provides a collision-free join for identifier values into a single composite ID. A plain `.join()` is ambiguous because different tuples can produce the same string (e.g. `['x|y','z']` and `['x','y|z']` both yield `'x|y|z'`). This module escapes each segment before joining so the result is unambiguously reversible for any delimiter.

## Key elements

- **`joinIdentifiers(values, delimiter)`** — the sole export. Joins an array of identifier values with the given delimiter, escaping each value first. Single-element arrays and values that contain neither delimiter characters nor the escape character pass through unescaped.
- **`segmentOf(value)`** _(internal)_ — normalises `null`/`undefined` to `''`, otherwise calls `String()`.
- **`escapeCharacterFor(delimiter)`** _(internal)_ — picks the escape character: backslash (code 92) if the delimiter doesn't contain it, otherwise the next code point that is absent from the delimiter. Deterministic.
- **`escapeSegment(value, delimiter, escape)`** _(internal)_ — escapes one code point at a time: prepends the escape char to any code point that is either the escape char itself or part of the delimiter. Iterates over code points (`[...str]`), so it never splits a surrogate pair.
- **`PREFERRED_ESCAPE_CODE`** _(constant)_ — `92` (backslash).

## Relationships

- **`src/composables/structureDataManagement.ts`** — consumes `joinIdentifiers` to build composite keys from multi-part identifiers.
- **`src/internal/restResource.ts`** — another consumer that needs a stable, unambiguous ID string from resource identifier tuples.
- **`tests/internal/identifierJoin.spec.ts`** — unit tests covering collision cases, surrogate-pair safety, and pass-through behaviour.

## Notes

- The escape character is always a code point **not** present in the delimiter, guaranteeing it can never be mistaken for part of a delimiter boundary.
- A single-element array is returned exactly as `.join()` would produce it (no escaping), matching the common "already-a-plain-ID" case.
- Because escaping works per code point, the algorithm is safe for emoji and other supplementary-plane characters; it never inserts an escape byte inside a surrogate pair.
- The module is intentionally dependency-free (no imports) and exports exactly one function, making it trivially testable and safe to pull into any internal module.
