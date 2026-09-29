---
source: tests/types/stores.test-d.ts
sha256: 4240864e6fc0afccf85416b3877131746498a6c506fda258f2037546052539cc
generated_at: 2026-09-28T23:14:47.576111+00:00
model: ollama:qwen3.8:27b
---

# tests/types/stores.test-d.ts

## Purpose

Compile-time type test (run by `tsc`, not a runtime test runner) that pins down the exact return shapes of the two Pinia setup stores (`useCoreStore`, `useNotificationsStore`) and the public constants `DEFAULT_INVALID_FIELD_SELECTOR` / `EToastType`. It exists to catch unintended changes to store signatures or exported types before they reach consumers.

## Key elements

- **`expectTypeOf` assertions on exports** — asserts `DEFAULT_INVALID_FIELD_SELECTOR` is `string` and `EToastType.PRIMARY` is `EToastType`.
- **Core store shape checks** — verifies `core.loadings` is `Record<string, boolean>` (not a `Ref`), and that `core.isLoading` takes `string[] | undefined` and returns `boolean`.
- **Notifications store shape checks** — verifies `notifications.history` and `notifications.messages` are both `IToastMessage[]`, and `notifications.addMessage(...)` returns `string` (the new message id).
- **`@ts-expect-error` negative assertions** — confirm that `isLoading(true)`, `setLoading(undefined, true)`, `setLoading('fetch')`, and `getLoading()` are all rejected by the type system.

## Relationships

- **`src/index.ts`** — sole import target; the file pulls `useCoreStore`, `useNotificationsStore`, `EToastType`, `IToastMessage`, and `DEFAULT_INVALID_FIELD_SELECTOR` through the public barrel rather than reaching into individual module files.
- **`src/stores/core.ts`** — provides the `useCoreStore` setup whose return type is asserted here (`loadings`, `isLoading`, `setLoading`, `getLoading`).
- **`src/stores/notifications.ts`** — provides the `useNotificationsStore` setup whose return type is asserted here (`history`, `messages`, `addMessage`).

## Notes

- File extension `.test-d.ts` signals a **type-only** test: it is checked by the TypeScript compiler (typically via `tsc --noEmit` or a `tsd`/`vitest typecheck` step), not executed at runtime.
- All imports go through `../../src/index.js` (the barrel). The test does **not** import `src/stores/core.ts` or `src/stores/notifications.ts` directly, so it validates the public surface only.
- Pinia setup stores unwrap refs at the type level on the store instance; `loadings` is therefore `Record<string, boolean>`, not `Ref<…>`. A consumer who needs a reactive ref must call `storeToRefs` instead.
- The two `@ts-expect-error` / `setLoading` lines double as documentation: they make it explicit that both the key **and** the boolean value are required parameters.
