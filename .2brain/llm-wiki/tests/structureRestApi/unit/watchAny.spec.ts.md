---
source: tests/structureRestApi/unit/watchAny.spec.ts
sha256: 2cb332732f61800f70e46c53119d7874ea2294714e443763893abd77f52f70ec
generated_at: 2026-09-28T23:06:58.364902+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/unit/watchAny.spec.ts

## Purpose

Unit tests for the `watchAny` composable method — the reactive (watch-based) counterpart of `fetchAny`. It verifies that `watchAny` correctly handles immediate fetches, reactive `enabled`/`key` inputs, independent key tracking, error surfacing, and the `stop`/`refetch` control surface. It exists to lock down the contract that makes `watchAny` structurally different from every other `watch*` method (it exposes a `data` ref over the raw result rather than an item dictionary).

## Key elements

- **`make()`** — local helper that calls `makeComposable<IUser, number>()` to produce a fresh composable instance for each test.
- **`describe('UNIT · watchAny')`** — the test suite containing seven cases:
    - Immediate fire + `data` ref exposure
    - Rejection surfaced on `error` ref (no throw)
    - `undefined`/void resolution handled gracefully (TanStack cache constraint)
    - Two distinct `key` values tracked independently
    - `refetch()` triggers a second call; `stop()` tears down
    - `enabled: ref(false)` defers the call until it flips to `true`
    - Reactive `key` (a `Ref<keyof[]>`) triggers re-execution on change
- **`afterEach(clearAllInstances)`** — global teardown so no composable instance leaks between tests.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** — supplies `makeComposable` (factory under test), `clearAllInstances` (teardown), and `flush` (microtask/tick helper).
- **`tests/structureRestApi/_helpers/fixtures.ts`** — provides the `IUser` type used to parameterize the composable factory.
- **`package.json`** — declares the Jest and Vue dependencies this spec imports.

## Notes

- The file header comment explicitly flags `watchAny` as the _only_ `watch*` method that returns a `data` ref over the raw query result; the others rely on the item dictionary. This distinction is the reason the test asserts on `data.value` directly.
- One test documents a TanStack Query constraint: bare `undefined` cannot be cached, so the composable must tolerate it.
- All API calls are mocked with `jest.fn()`; no network or real store is involved.
- `flush()` is the project's microtask-advancing helper — use it after any async composable operation before asserting.
