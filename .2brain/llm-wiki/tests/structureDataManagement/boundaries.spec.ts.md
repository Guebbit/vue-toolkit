---
source: tests/structureDataManagement/boundaries.spec.ts
sha256: 0262ac8113f7198bbed79c2f5da85f93ffdf4ab4d04853a4272a93037d9f6d3d
generated_at: 2026-09-28T22:44:33.267898+00:00
model: ollama:qwen3.8:27b
---

# tests/structureDataManagement/boundaries.spec.ts

## Purpose

Unit tests that pin down two boundary behaviors of the `useStructureDataManagement` composable: identifier generation when all expected fields are already populated, and the reactivity contract of `pageSize` (watchers should fire only on an actual value change).

## Key elements

- **`describe('UNIT · structureDataManagement boundaries')`** — top-level block; silences `console.warn` for the duration of each test.
- **Test: "does not fill any identifier when all of them are present"** — calls `createIdentifier(item)` with a record that already has every declared identifier field; asserts the composed string, that no warning is emitted, and that the input object is not mutated.
- **Test: "notifies pageSize watchers only when the size actually changes"** — registers a synchronous Vue `watch` on `c.pageSize`; verifies that assigning the same value (10), a fractional value that rounds down to the same integer (10.5), or a genuinely different value (20) produces exactly one watcher invocation.

## Relationships

- **`src/composables/structureDataManagement.ts`** — the module under test. The spec imports `useStructureDataManagement` and exercises its returned `createIdentifier` function and `pageSize` ref.
- **`package.json`** — provides the test runner (Jest globals: `describe`, `it`, `expect`, `jest.spyOn`) and the `vue` peer dependency needed for the `watch` import.

## Notes

- `pageSize` appears to coerce to an integer internally (10.5 → 10), so the "no change" check is against the _effective_ integer, not the raw assignment.
- The tests rely on `flush: 'sync'` to avoid flakiness from Vue's default post-flush scheduling; dropping that option would make the `fires` counter assertions unreliable.
- `console.warn` is spied on to both suppress noise and to assert the _absence_ of a fallback-id warning path.
