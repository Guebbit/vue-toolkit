---
source: tests/structureRestApi/unit/queryOptions.spec.ts
sha256: fffb4d1dad6d5c8fac4ffb7569d40dec1bb92d50d21550ee0ff01ca0a60ad6be
generated_at: 2026-09-28T23:05:32.009895+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/queryOptions.spec.ts

## Purpose

Unit tests verifying that `queryOptions` (the five TanStack Query keys: `retry`, `retryDelay`, `refetchInterval`, `refetchOnWindowFocus`, `refetchOnReconnect`) correctly pass through to every **active** (`watch*`) query, that a watcher-level value overrides the resource-level default, and that the option never leaks into one-shot `fetch*` calls or clobbers engine-owned settings like `gcTime`.

## Key elements

- **`describe('UNIT · queryOptions passthrough')`** — the single suite; all tests are `it` blocks asserting call-count or record-survival after a simulated failure/stop cycle.
- **Resource-default tests** — confirm `retry: N` set on the composable causes `N+1` API invocations across `watchAll` and `watchTarget`.
- **Watcher-override test** — `watchAny` with its own `queryOptions: { retry: 0 }` suppresses the resource's `retry: 2`.
- **No-options fallback test** — with no `queryOptions` anywhere, the harness `QueryClient` default (`retry: false`) yields exactly 1 call.
- **One-shot exclusion test** — `fetchAll` with `retry: 2` still fires the API only once.
- **`gcTime` smuggling tests (×2)** — passing `gcTime: 0` (outside `ITanStackQueryOptions`) at both watcher and resource level; asserts the cached record **survives** after `handle.stop()`, proving the engine's own `gcTime` was not overridden.

## Relationships

- **`src/composables/structureRestApi.ts`** — the SUT. The test imports the `ITanStackQueryOptions` type from it and exercises its `watchAll`, `watchTarget`, `watchAny`, `fetchAll`, `getRecord`, and `handle.stop()` surface.
- **`tests/structureRestApi/_helpers/harness.ts`** — provides `makeComposable` (constructs a composable instance with a test `QueryClient` whose default is `retry: false`), `clearAllInstances` (used in `afterEach`), and `flush` (advances microtasks / fake timers so retries and GC ticks complete).
- **`tests/structureRestApi/_helpers/fixtures.ts`** — supplies the `IUser` type and `USERS` array used as the resolved payload in the `gcTime` survival tests.
- **`package.json`** — declares the test runner (Jest) and the `@tanstack/vue-query` / Vue dependencies the composable relies on.

## Notes

- The harness `QueryClient` is configured with `retry: false`, so any observed retry **must** come from the passthrough under test — this is the mechanism that makes the call-count assertions meaningful.
- `flush(10)` (10 ms) is used in retry tests to allow the TanStack retry timer to fire; a plain `flush()` suffices for non-retry tests.
- The `gcTime` smuggling tests cast through `Record<string, unknown>` → `ITanStackQueryOptions` to simulate a caller passing an extra key; the composable is expected to **ignore** it. Removing that filter would cause the record to be garbage-collected immediately on `stop()`, breaking the cache layout.
