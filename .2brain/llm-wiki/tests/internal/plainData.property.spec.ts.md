---
source: tests/internal/plainData.property.spec.ts
sha256: 118be23b8d9b5b7b247b083f5ff22699431f0ed784e9561f311f371cd9f182f7
generated_at: 2026-09-28T22:41:03.657399+00:00
model: ollama:qwen3.8:27b
---

# tests/internal/plainData.property.spec.ts

## Purpose

Property-based test suite (via `fast-check`) that pins the invariants declared in `src/internal/plainData.ts` JSDoc across _generated_ inputs rather than hand-picked examples. It verifies that `stableKey`, `hasKeyPrefix`, and `matchesAnyPrefix` behave correctly regardless of key order, collection type, or structural nesting.

## Key elements

- **`byCodeUnit`** – comparator that orders strings by UTF-16 code unit (the default `sort()` order); used to build canonical Set arrays in tests.
- **`rotate<E>`** – deterministic array rotation helper; simulates key-order changes without changing membership.
- **`sharesReference`** – recursive check that two trees share a plain-object/array reference anywhere (the thing `detachedCopy` promises to eliminate).
- **`describe('PROPERTY · stableKey', …)`** – asserts order-invariance, `undefined`-key exclusion, content sensitivity, and Set/Map/array distinctness.
- **`describe('PROPERTY · stableKey · Map and collection expansion', …)`** – asserts Map insertion-order invariance, cycle safety (self-referencing objects/Maps), shared non-cyclic reference expansion, and that class instances are _not_ expanded.
- **`describe('PROPERTY · hasKeyPrefix', …)`** – asserts prefix self-containment, empty-prefix universality, single-segment mismatch rejection, order sensitivity, and short/missing-key rejection.
- **`describe('PROPERTY · matchesAnyPrefix', …)`** – asserts empty-prefix universality, string-prefix matching, and non-matching rejection.

## Relationships

- **`src/internal/plainData.ts`** – the module under test; this spec imports `detachedCopy`, `hasKeyPrefix`, `matchesAnyPrefix`, and `stableKey` from it.
- **`package.json`** – supplies the `fast-check` and `vue` dev dependencies and the test-runner script that executes this spec.

## Notes

- The file header points to `docs/guide/testing.md` for the seed + path replay procedure when a property fails.
- `detachedCopy` and `reactive` (from Vue) are imported in the header but their test blocks fall in the truncated portion of the file; the visible code does not exercise them.
- `sharesReference` is defined at module scope; it is almost certainly used by the `detachedCopy` tests below the truncation point.
- A notable non-obvious invariant: a **class instance** holding a `Set` is _not_ expanded (its inner `Set` is passed through to `canonicalize` as-is), whereas an equivalent plain object _is_ expanded. The test asserts `stableKey(new Holder(new Set(['a'])))` equals `stableKey(new Holder(new Set(['b'])))` — i.e., the `Set` content is invisible inside a class instance.
- Shared non-cyclic references (the same object reachable from two branches) are expanded on **both** branches, not deduplicated. Only true cycles are short-circuited.
