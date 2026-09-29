---
source: src/composables/livenessProbe.ts
sha256: 65e4a4e5e998b1fada4e93c00fb6e5fe8f9fba0b4c6ee1b6f5f48416818c9ab0
generated_at: 2026-09-28T22:29:33.090760+00:00
model: ollama:qwen3.8:27b
---

# src/composables/livenessProbe.ts

## Purpose

A Vue composable that tracks whether an external dependency (liveness endpoint, socket, CDN, etc.) is still reachable. It exposes a reactive `down` flag and drives re-probing on creation, on browser `online` events, and on a slow retry loop that runs only while the target is down. Designed to power a "you're offline" banner, not a high-frequency health monitor.

## Key elements

- **`useLivenessProbe(probe, settings?)`** — Main composable. Accepts a caller-supplied `() => Promise<unknown>` (resolve = reachable, reject = unreachable) plus optional settings. Returns `{ down, check, stop }`.
- **`ILivenessProbeSettings`** — Config interface: `retryDelay` (default 30 s), `immediate` (default `true`), `target` (an `EventTarget` to receive the `online` listener; defaults to `globalThis` when `addEventListener` exists).
- **`ILivenessProbe`** — Convenience type alias for the composable's return type.
- **`down`** (`Ref<boolean>`) — Reactive state; `true` while the last probe failed.
- **`check()`** — Probes immediately, cancels any pending retry first, and returns a `Promise<void>` that always resolves. Bumps a generation counter so overtaken probes discard their result.
- **`stop()`** — Idempotent teardown: bumps the generation counter, sets a `_stopped` latch, clears the retry timer, and removes the `online` listener. Auto-registered via `onScopeDispose` when inside a Vue effect scope.
- **`_latest` / `_stopped`** — Internal mutation-testing-annotated generation counter and final latch that together prevent stale writes after teardown.

## Relationships

- **`src/internal/promiseTry.ts`** — Provides `promiseTry`, which converts a possibly-synchronous-throwing probe into a rejecting Promise so the composable treats sync throws identically to rejections.
- **`src/index.ts`** — Graph neighbor; re-exports this composable as part of the public package API.
- **`vue`** (via `package.json`) — Supplies `ref`, `getCurrentScope`, and `onScopeDispose` for reactive state and scope-tied teardown.
- **`tests/livenessProbe.spec.ts`** — Unit tests exercising probe lifecycle, retry timing, `online`-event wiring, and teardown.
- **`tests/types/livenessProbe.test-d.ts`** — Compile-time assertions on the exported types (`ILivenessProbe`, `ILivenessProbeSettings`).

## Notes

- **Single-timer invariant:** Exactly one retry `setTimeout` can exist at any time; every scheduling path calls `_cancelRetry` first. An `online` event mid-loop _replaces_ the chain rather than forking it.
- **SSR / no-DOM safe:** The code checks `typeof addEventListener === 'function'` before treating `globalThis` as an `EventTarget`, so it degrades to "no auto-retry" under Node or SSR. Pass `target` explicitly in tests to drive the `online` path without a DOM.
- **`check()` never rejects** — an unreachable target is the _reported_ state, not an error. Callers can safely `void check()`.
- **Stryker annotations:** Two `Stryker disable next-line UpdateOperator` comments mark the `++_latest` lines as generation-token increments where direction is irrelevant to mutation testing.
- **`stop()` is idempotent and final:** After calling it, subsequent `check()` calls resolve immediately without probing, and no further retry timers are scheduled.
