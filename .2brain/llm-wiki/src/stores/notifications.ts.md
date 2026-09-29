---
source: src/stores/notifications.ts
sha256: 213cfae6d884acfbd0ac1e8630ea7d9245b6e30d125a2d2ff9a7ce5997c18d12
generated_at: 2026-09-28T22:38:25.463105+00:00
model: ollama:qwen3.8:27b
---

# src/stores/notifications.ts

## Purpose

A Pinia **setup store** that manages the application's toast notifications. It maintains an append-only `history` of all toasts ever added, exposes the currently visible subset as a computed `messages` array, and provides actions to add, show, hide, and permanently remove toasts. An optional per-message timeout auto-hides a toast after a set duration.

## Key elements

- **`EToastType`** (enum) – Visual variant: `PRIMARY`, `SECONDARY`, `DANGER` (value `'error'`), `WARNING`, `SUCCESS`.
- **`IToastMessage`** (interface) – Shape of one toast: `id`, `message`, `type`, `visible`.
- **`useNotificationsStore`** – Pinia store (`id: 'notifications'`), returns:
    - `history` – `ref<IToastMessage[]>`; every toast ever added, in insertion order.
    - `messages` – `computed`; filters `history` to those with `visible === true`.
    - `addMessage(message, type?, timeout?)` – Appends a visible toast; if `timeout > 0`, schedules `hideMessage` via `setTimeout`. Returns the new `id`.
    - `findMessage(id)` – Returns the toast or `undefined`.
    - `setVisibility(id, visible)` – Internal helper shared by show/hide.
    - `hideMessage(id)` / `showMessage(id)` – Flip the `visible` flag; the entry stays in `history`.
    - `removeMessage(id)` – **Only** action that deletes a toast from `history`.

## Relationships

- **`package.json`** – Runtime deps consumed here: `pinia` (`defineStore`), `vue` (`ref`, `computed`), `@guebbit/js-toolkit` (`getUuid`).
- **`src/index.ts`** – Application entry point; consumes the store (likely mounts a toast UI component that reads `messages` and calls the actions).
- **`tests/notifications.spec.ts`** – Unit tests covering add / show / hide / remove / timeout behavior.
- **`tests/types/stores.test-d.ts`** – Compile-time type assertions on the store's returned shape.

## Notes

- `EToastType.DANGER` has the **value** `'error'`, not `'danger'`. UI code must map on the value, not the key name.
- Hiding (`hideMessage`) is **not** deletion. Only `removeMessage` splices the entry out of `history`. UI code should treat `history` as the source of truth for "has this toast ever existed."
- The auto-hide `setTimeout` is **not** stored or cancelled. If a toast is manually hidden before its timeout fires, the later `hideMessage` call is a harmless no-op, but the timer still executes. There is no `clearTimeout` path.
- IDs are generated via `getUuid()` from `@guebbit/js-toolkit`; callers are expected to retain the returned `id` to target a specific toast later.
