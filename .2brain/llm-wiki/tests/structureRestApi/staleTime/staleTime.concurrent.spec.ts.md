---
source: tests/structureRestApi/staleTime/staleTime.concurrent.spec.ts
sha256: e0a4e86c53e409c0f5cb15ee8704c171be9f49c0e108188743aacce0d9fd2e7b
generated_at: 2026-09-28T22:58:39.501677+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/staleTime/staleTime.concurrent.spec.ts

## Purpose

Verifies TanStack Query's deduplication and cache-hit behavior under concurrency: that identical in-flight requests collapse to one API call, distinct-key requests each fire, and immediately-successive reads (including a POST-then-GET sequence) are served from cache without a second network call.

## Key elements

- **`make()`** — local factory that calls `makeComposable<IUser, number>()` to produce a fresh composable instance per test.
- **`afterEach(clearAllInstances)`** — global teardown ensuring no composable state leaks between tests.
- **Test: "two identical in-flight fetchAll calls dedupe to ONE API call"** — fires two `fetchAll` calls against the same deferred promise; asserts the spy was called exactly once.
- **Test: "concurrent fetches on different keys each run"** — two `fetchAll` calls with `{ key: ['A'] }` / `{ key: ['B'] }`; asserts both spies are called once.
- **Test: "an immediate second GET is served from cache"** — sequential `fetchAll` with two `apiResolve` mocks; asserts the second mock is never called.
- **Test: "a create (POST) immediately followed by a GET … is a cache hit"** — calls `createTarget` then `fetchTarget(4)`; asserts the GET mock is never invoked.

## Relationships

- **`_helpers/harness.ts`** — supplies `makeComposable` (the SUT) and `clearAllInstances` (reset between tests).
- **`_helpers/fakeApi.ts`** — supplies `apiResolve` (resolves immediately, used as a spy) and `deferredApi` (returns a controllable promise pair `{ call, control }` to hold requests in-flight until the test resolves them).
- **`_helpers/fixtures.ts`** — supplies the `USERS` array and the `IUser` interface used as payload and type parameter.

## Notes

- Deliberately uses **real timers** with externally-controlled deferred promises rather than `jest.useFakeTimers`; the file's own doc-block calls this out.
- Deduplication is an implicit TanStack Query behavior (shared in-flight promise per query key) — the test does not configure a custom `staleTime`; it relies on the default.
- The concurrent-different-keys test must pass an explicit `{ key: […] }` override; without it both calls would share the same default key and be deduped.
- The POST→GET test depends on `createTarget` writing the created entity into the cache under the target's id key, making the subsequent `fetchTarget` a cache hit.
