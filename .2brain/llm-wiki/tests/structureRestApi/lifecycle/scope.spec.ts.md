---
source: tests/structureRestApi/lifecycle/scope.spec.ts
sha256: b242e8860a752617d4b3c7c710a364f686a968d4c3355c5d1ad2515b48dccab3
generated_at: 2026-09-28T22:54:34.780421+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/lifecycle/scope.spec.ts

## Purpose

Verifies the Vue effect-scope lifecycle contract of `useStructureRestApi`: stopping the owning scope freezes the composable's reactive view (unsubscribes its `QueryCache` listeners) without clearing the caller-owned `QueryClient`, and ensures the composable still functions when created outside any scope.

## Key elements

- **`describe('LIFECYCLE · effect-scope teardown')`** — single suite with four tests covering:
    - _Scope stop preserves shared QueryClient data_ — after `scope.stop()`, `queryClient.getQueryData(...)` still returns the previously fetched record.
    - _Scope stop kills the view subscription_ — a direct `setQueryData` write to the shared client after stop does **not** update `c.itemList`.
    - _`watchTarget` child-scope teardown_ — a `watchTarget` call made inside the scope stops firing once the scope is stopped (its nested child scope is disposed with the parent).
    - _No active scope guard_ — asserts `getCurrentScope()` is `undefined`, then confirms `fetchAll`, `resetAll`, `checkAll`, and `checkTarget` all work with a caller-supplied client.
- **`afterEach(clearAllInstances)`** — global cleanup of every tracked instance between tests.

## Relationships

- **`src/composables/structureRestApi.ts`** — the composable (`useStructureRestApi`) under test; its `fetchAll`, `watchTarget`, `resetAll`, `checkAll`, `checkTarget`, `itemList` surface is exercised here.
- **`tests/structureRestApi/_helpers/harness.ts`** — provides `track` (associates a composable instance with a scope for cleanup), `newTestClient` (fresh `QueryClient` per test), `clearAllInstances` (teardown), and `DEFAULT_STALE_TIME`.
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — provides `apiResolve`, which wraps a value in a resolved promise shaped like an API response.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — provides the `USERS` array and `IUser` type used as test data.

## Notes

- The file's header comment encodes the design intent: scope disposal means "view stops updating," **not** "data is wiped." The `QueryClient` is always caller-owned, so nothing in the composable's scope teardown touches it.
- In the last test, `track(c, effectScope())` creates a throwaway scope solely so `clearAllInstances` can later dispose the instance's cache listeners; it does **not** simulate a real owning scope.
- `watchTarget`'s effect runs in a child scope nested under whatever scope was active at call time; stopping the parent disposes it, mirroring plain Vue `watch()` semantics.
