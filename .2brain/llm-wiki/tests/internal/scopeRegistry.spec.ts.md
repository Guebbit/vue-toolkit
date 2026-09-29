---
source: tests/internal/scopeRegistry.spec.ts
sha256: 71467f7488876830dc931b20bd6feb569759d2624ee78e56168f929258bc933e
generated_at: 2026-09-28T22:42:03.646945+00:00
model: ollama:qwen3.8:27b
---

# tests/internal/scopeRegistry.spec.ts

## Purpose

Unit tests for `scopeRegistryFor`, verifying that scopes use reference-counted claim/release semantics: a scope stays live until every claim is released, each release token is one-shot, and registry state is isolated per `(QueryClient, resourceKey)` pair.

## Key elements

- **`describe('UNIT · scopeRegistryFor')`** — the single test suite; sets up a fresh `QueryClient` in `beforeEach` and calls `queryClient.clear()` in `afterEach`.
- **`an unclaimed scope is not live`** — asserts `isLive` returns `false` before any `claim`.
- **`two claims need two releases before the scope drops`** — verifies the count is 2, and the scope goes inactive only after both release tokens are invoked.
- **`a release called twice counts once`** — confirms a release token is idempotent (one-shot); calling it twice decrements only once.
- **`a release after the scope is gone is a no-op…`** — ensures a stale release does not drive the count negative or resurrect the scope.
- **`scopes are matched by content and counted separately`** — shows that scope-key arrays are compared by content (key order irrelevant) and that structurally different scopes are independent counters.
- **`registries of two resource keys, or two clients, do not share claims`** — proves isolation: claims on `(clientA, 'items')` are invisible to `(clientA, 'other')` and `(clientB, 'items')`, while the same pair always resolves to the same registry.

## Relationships

- **`src/internal/scopeRegistry.ts`** — the module under test. This file imports and exercises `scopeRegistryFor(queryClient, resourceKey)`, which returns an object exposing `claim(scopeKeys)` (returns a release function) and `isLive(scopeKeys)`. No other imports are used.

## Notes

- Scope-key arrays are compared _by content_, not by reference or key order (e.g. `[{lang:'en', user:1}]` matches `[{user:1, lang:'en']}`). Tests rely on this; the implementation must handle it.
- Release tokens are guaranteed one-shot; calling a release twice must not double-decrement. The test "a release after the scope is gone is a no-op" also guards against negative counts leaking into a subsequent fresh claim.
- `QueryClient` is used only as an identity token (and for `clear()` in teardown); no TanStack Query API is actually exercised beyond construction.
