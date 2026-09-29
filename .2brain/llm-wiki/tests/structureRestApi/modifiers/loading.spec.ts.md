---
source: tests/structureRestApi/modifiers/loading.spec.ts
sha256: 72e23707c417de1d45e03f97d470cbfd512273c26b85fb9c11eddf10b34d842e
generated_at: 2026-09-28T22:55:51.918045+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/modifiers/loading.spec.ts

## Purpose

Verifies the `isLoading()` modifier's behaviour in two edge cases: (1) it must reset to `false` even when the underlying API call rejects, and (2) it must act as an in-flight **counter** (like TanStack Query's `isFetching()`/`isMutating()`) so that one concurrent fetch resolving does not clear the state while another is still pending.

## Key elements

- **`describe('MODIFIER · isLoading')`** — the sole test suite in the file; two `it` blocks.
- **Test 1 – "resets to false after the API rejects"** — calls `c.fetchAll(apiReject(), { forced: true })`, asserts the promise rejects, then asserts `c.isLoading()` is `false`.
- **Test 2 – "stays true while a concurrent fetch is still pending"** — fires two independent `fetchAll` calls (distinct cache keys `['A']`, `['B']`) backed by `deferredApi` handles; resolves one, asserts `isLoading()` is still `true`; resolves the second, asserts `false`.
- **`afterEach(clearAllInstances)`** — tears down every composable instance between tests.

## Relationships

- **`_helpers/harness.ts`** — supplies `makeComposable<TData, TKey>()` (creates an isolated composable under test) and `clearAllInstances()` (scope cleanup).
- **`_helpers/fakeApi.ts`** — supplies `apiReject()` (a ready-made rejecting API stub) and `deferredApi<T>()` (a controllable API whose resolution you trigger manually via `.control.resolve()`).
- **`_helpers/fixtures.ts`** — supplies the `USERS` array and the `IUser` interface used as the generic data shape for the composable.

## Notes

- The concurrent test pre-attaches `p1.catch(() => {})` / `p2.catch(() => {})` **before** any assertion. Without this, a mid-test failure would leave a TanStack-managed fetch in flight; `clearAllInstances` would cancel it, producing a `CancelledError` rejection that, if unhandled, kills the Jest worker and swallows all remaining results in the file.
- Two different cache keys (`['A']` vs `['B']`) are used deliberately so both fetches actually execute; identical keys would be deduped by TanStack and the concurrency scenario would not be exercised.
- The file header documents the design intent: `isLoading` is derived from TanStack's in-flight query/mutation **count**, not a simple boolean flag.
