---
source: tests/structureRestApi/intention/shared-client.spec.ts
sha256: 675f95ad19c4ad3a2435a08b8f875e593ee7ea71dd7d91723e2162cbdc69caac
generated_at: 2026-09-28T22:51:21.610717+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/intention/shared-client.spec.ts

## Purpose

Verifies the cache-sharing semantics when two composables share a single `QueryClient`. It asserts that identical `resourceKey` values cause cache buckets to be shared (one fetch warms the other), while differing `resourceKey` values namespace them apart even on the same client instance.

## Key elements

- **`describe('INTENTION · shared QueryClient')`** — top-level suite; all tests share an `afterEach(clearAllInstances)` hook for isolation.
- **Test 1 – shared key, `fetchAll` cache hit** — uses `makeShared` to get two composables (`a`, `b`) on the same client. Calls `fetchAll` on both with `{ key: ['roster'] }`; expects the first mock API spy to be called once and the second never.
- **Test 2 – shared key, `fetchTarget` sees prior data** — `a.fetchAll` seeds the cache; `b.fetchTarget` with the same id expects the mock spy for the target fetch to _not_ be called.
- **Test 3 – different `resourceKey`, no sharing** — constructs two composables via `makeComposable` on the _same_ `newTestClient()` but with `resourceKey: 'a'` vs `'b'`. Both `fetchAll` calls hit the network; the second spy _is_ called once.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** — supplies `makeShared` (creates a pair of composables sharing one client), `makeComposable` (single composable with explicit options), `clearAllInstances` (resets registry between tests), and `newTestClient` (fresh `QueryClient` for isolated setup).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — supplies `apiResolve`, which wraps a static value in a jest-mock function so the spec can assert call counts without real network I/O.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — supplies the `USERS` array and `IUser` type used as the data payload and generic type parameter throughout.

## Notes

- `apiResolve` returns a _mock function_ (not a plain Promise), which is why the spec can use `.toHaveBeenCalledTimes` / `.not.toHaveBeenCalled()` assertions.
- Test 3 deliberately avoids `makeShared` and instead uses `makeComposable` twice on a single `newTestClient()` to prove that resourceKey isolation is a key-based concern, not a client-identity concern.
- The `afterEach(clearAllInstances)` hook is essential: without it, the shared-instance registry would leak state between the three tests.
