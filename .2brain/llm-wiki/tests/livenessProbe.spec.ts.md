---
source: tests/livenessProbe.spec.ts
sha256: 12e3c7138ada6bb672f561ee103a0291132f9a446d63381b8a88ba727b8cba88
generated_at: 2026-09-28T22:43:01.735714+00:00
model: ollama:qwen3.8:27b
---

# tests/livenessProbe.spec.ts

## Purpose

Integration-style tests for the `useLivenessProbe` composable that verify its behavioural contract—probe only while down, probe slowly, maintain exactly one retry chain, and tear down cleanly via effect scopes—by asserting probe **call counts over simulated time** rather than just the `down` flag, since the failure mode (a background request storm) is invisible to type-level or single-probe checks.

## Key elements

- **`settle()`** — Awaits 5 microtask ticks (`Promise.resolve()`) so that nested `.then`/`.catch` chains in the composable and in wrapped promises fully resolve without advancing the fake clock. A single tick would read state before all links execute.
- **`scopes: EffectScope[]`** — Registry of every effect scope a test creates. `afterEach` stops them all unconditionally, preventing timer/subscription leaks between tests.
- **`inScope(run)`** — Wraps a composable call in a fresh `effectScope`, registers the scope _before_ executing (so a synchronous throw is still torn down), and returns `{ result, dispose }`.
- **`throwSynchronously()`** — Mock probe implementation that throws before returning a promise, used to verify the composable treats synchronous throws identically to rejections.
- **`probe` (jest mock)** — The probe function injected into the composable; configured per-test to resolve, reject, throw, or return a controllable pending promise.
- **`target` (EventTarget)** — Simulates `online` events to trigger re-probes.
- **`describe` blocks** — _the flag_ (initial state, up/down transitions, synchronous-throw handling), _the retry chain_ (single-probe while up, `immediate: false`, delay boundaries, repeated online events, stale-response overwrite in both directions), _teardown_ (scope disposal stops retries, unsubscribes, is idempotent, ignores in-flight probes, prevents post-teardown `check()` from spawning retries), _without an event target_ (probes but never re-probes on its own).

## Relationships

- **`src/composables/livenessProbe.ts`** — Direct import; the sole system under test (`useLivenessProbe`). Every assertion exercises its observable API: `down`, `check()`, `stop()`.
- **`src/internal/restResource.ts`** — Indirectly related as the typical implementation a caller would pass as the `probe` argument, but not imported or referenced in this file.
- **`package.json`** — Provides the `vue` (`effectScope`) and `jest` dependencies; no direct code coupling beyond the test-runner and framework APIs.

## Notes

- The critical regression test is **"keeps exactly one retry chain across repeated online events"**: two `online` dispatches must yield 3 total probes (not 5), and a 30 s timer advance must produce exactly 1 additional probe (not 3). Without it, orphaned retry chains cause a silent background request storm.
- `settle()` deliberately uses 5 hops, not 1. If you add another promise layer to the composable, this number may need to grow; a single tick will read a stale value.
- `inScope` pushes the scope into `scopes` _before_ calling `scope.run`, so a composable that throws on creation is still cleaned up in `afterEach`.
- The "stale response" tests use `Promise.withResolvers` (ES2024) to keep a promise pending until the test explicitly resolves or rejects it—don't replace with a plain `new Promise` callback pattern without preserving the controllable timing.
- Timing boundary test (4999 ms → no retry; 1 ms more → retry) is exact; the composable's delay check is inclusive of the configured `retryDelay`.
