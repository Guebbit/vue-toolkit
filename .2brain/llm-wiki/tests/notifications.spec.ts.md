---
source: tests/notifications.spec.ts
sha256: 3ea16b53a856438a0f9136fe202b3474c476728fb8bdb0ae2818630ef72799f4
generated_at: 2026-09-28T22:43:13.276417+00:00
model: ollama:qwen3.8:27b
---

# tests/notifications.spec.ts

## Purpose

Jest test suite for the `useNotificationsStore` Pinia store. It verifies the full message lifecycle (add, show, hide, remove, find), the computed `messages` getter, the default toast type, and the auto-hide timeout behavior (including edge cases like zero/negative timeouts and timers firing after removal).

## Key elements

- **`describe('useNotificationsStore')`** — Top-level block; sets up a fresh Pinia instance via `setActivePinia(createPinia())` in `beforeEach`.
- **Initial-state test** — Asserts `history` and `messages` both start empty.
- **`addMessage` tests** — Verifies the message is appended to `history`, the returned `id` matches, `visible` defaults to `true`, and type defaults to `EToastType.PRIMARY` when omitted.
- **`hideMessage` / `showMessage` / `removeMessage` / `findMessage` tests** — Confirm each mutates the correct record by `id` and that `messages` (computed) reflects only visible entries.
- **`describe('auto-hide timeout')`** — Sub-block using `jest.useFakeTimers()`:
    - Positive timeout: message is still visible at `t-1`, hidden at `t`, but retained in `history`.
    - `timeout <= 0` (default `-1` or explicit `0`): no timer is scheduled; messages stay visible indefinitely.
    - Stale-timer safety: advancing the clock after `removeMessage` is a no-op (no throw, no resurrection).

## Relationships

- **`src/stores/notifications.ts`** — The module under test. This spec imports `useNotificationsStore` and `EToastType` directly from it.
- **`package.json`** — Provides the Jest runtime and the `pinia` dependency that both the store and its test setup rely on.

## Notes

- The `id` returned by `addMessage` is the **only** stable handle for targeting a specific message; the tests emphasize this (comment in the source). Any refactoring that changes how ids are assigned will break these tests.
- `timeout` of `0` or negative is intentionally _not_ auto-hide — it means "sticky/forever." Tests explicitly guard against accidentally scheduling a timer for those values.
- Fake timers are scoped to the auto-hide sub-block only; the rest of the suite runs with real timers.
