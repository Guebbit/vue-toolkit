---
source: tests/structureSearchApi/lifecycle/mountedComponent.spec.ts
sha256: 917f8f00d2cb71a4a23c22efe593b20f5c5e91e1adb42cc62807be84160f0f66
generated_at: 2026-09-28T23:10:33.351055+00:00
model: ollama:qwen3.8:27b
---

# tests/structureSearchApi/lifecycle/mountedComponent.spec.ts

## Purpose

Tests the lifecycle contract of a search resource that is **built inside a mounted component's `setup()`** but **watched from code outside that component** (click handlers, awaited continuations, Pinia stores). Ensures Vue's pre-flush watcher ordering guarantees hold regardless of which component scope created the watcher.

## Key elements

- **`buildInComponent()`** — Creates a fresh `queryClient` (via harness), mounts a minimal `createApp` whose `setup()` calls `useStructureSearchApi<{id:number}, number>`, and registers unmount/cleanup in the `teardown` array. Returns the resource for assertions.
- **`searchOperation()`** — Returns a `jest.fn` that resolves a `ISearchResult` with `totalItems: 100` and empty `items`, simulating a paginated backend.
- **`renderNothing`** — Trivial `h('div')` render function; the suite tests only `setup()` wiring, not rendering.
- **`teardown` / `afterEach`** — LIFO cleanup stack; every test pushes its undo functions, and `afterEach` drains them in reverse.
- **`describe` / `it` block** — Single test: after navigating to page 3, changing `pageSize` to 25 must (a) reset `pageCurrent` to 1 and (b) issue exactly **one** fetch call with `(filters, 1, 25)`, never the stale page.

## Relationships

- **`src/composables/structureSearchApi.ts`** — The composable under test; this spec exercises its `watchSearch`, `pageCurrent`, and `pageSize` API as wired through a real component lifecycle.
- **`tests/structureSearchApi/_helpers/harness.ts`** — Supplies `newTestClient()` and `flush()` (microtask/tick advancement) used by every test in this suite.
- **`package.json`** — Provides the Jest/Stryker configuration and the `@stryker-mutator/jest-runner` dependency that makes the file-level `@jest-environment` docblock directive work for mutation testing.
- **`tests/structureRestApi/_helpers/harness.ts`** — Sibling harness for the REST API suite; not directly imported here but shares the same `flush`/`newTestClient` contract (useful when cross-referencing test patterns).

## Notes

- The `@jest-environment @stryker-mutator/jest-runner/jest-env/jsdom` docblock is **required** for Stryker mutation testing to instrument coverage; plain `jsdom` works for regular `npm test` but will silently skip mutation coverage for this file.
- The test asserts on `call.slice(0, 3)` rather than the full call arguments because the 4th arg (`AbortSignal`) breaks Jest's pretty-printer under jsdom.
- Watchers are intentionally created **outside** any component scope (no `currentInstance`), which is the worst-case path for Vue's pre-flush ordering — the spec exists to prove correctness under that condition.
- Only one `it` block is present; the `describe` name reads as a suite label for future lifecycle tests (the comment "LIFECYCLE" and the `teardown` stack suggest more cases are anticipated).
