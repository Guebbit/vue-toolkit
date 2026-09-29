---
source: tests/types/livenessProbe.test-d.ts
sha256: 9e3f41a95fb641983f96d34fbabf8d5b8581ae2ad3d96da83595f9676973ff71
generated_at: 2026-09-28T23:14:31.853449+00:00
model: ollama:qwen3.8:27b
---

# tests/types/livenessProbe.test-d.ts

## Purpose
Compile-time type test for `useLivenessProbe`. It asserts the public type contract of the probe's `down`, `check`, and `stop` members and verifies that the factory rejects non-Promise callbacks — all without executing any runtime code.

## Key elements
- **`expectTypeOf(probe.down.value).toEqualTypeOf<boolean>()`** — `down` is a reactive ref whose `.value` is `boolean`.
- **`expectTypeOf(probe.check).returns.toEqualTypeOf<Promise<void>>()`** — `check` is an async function returning `Promise<void>`.
- **`expectTypeOf(probe.stop).toEqualTypeOf<() => void>()`** — `stop` is a synchronous no-arg teardown.
- **`@ts-expect-error` block** — asserts that passing a callback returning a non-Promise (e.g. `() => 'not a promise'`) is a type error; the probe parameter must be `() => Promise<unknown>`.

## Relationships
- **`src/composables/livenessProbe.ts`** — the implementation under test. This file exercises its exported type signature; changes to that file's return type or parameter type will break (or pass) these assertions at compile time.
- **`src/index.ts`** — the package entry point through which `useLivenessProbe` is re-exported. The import here goes via this barrel, so the test also guards against accidental removal or rename in the public surface.

## Notes
- This is a **type-only** test (`.test-d.ts` suffix). It runs under the TypeScript compiler / a type-test runner, not under Vitest/Jest at runtime.
- The callback's resolved value is intentionally unconstrained (`Promise.resolve('anything, ignored')`); the contract only requires that it *is* a Promise, not what it resolves to.
- The `@ts-expect-error` line means the build **fails** if the type error is ever removed — it acts as a negative type assertion.
