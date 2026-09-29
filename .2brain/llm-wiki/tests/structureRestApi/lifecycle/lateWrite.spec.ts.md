---
source: tests/structureRestApi/lifecycle/lateWrite.spec.ts
sha256: 4218347ca5ea27e58e54d80af513a904373c02f21c361ffb64c5398d3ea1ffee
generated_at: 2026-09-28T22:52:30.372451+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/lifecycle/lateWrite.spec.ts

## Purpose

Verifies the **late-write guard**: a network response that resolves _after_ `dependsOn` has already changed must not write any data under the old context. Without this guard, a late write would silently resurrect queries that the `dependsOn` watcher already cancelled and removed, leaking stale data into memory.

## Key elements

- **`describe('LIFECYCLE · late writes after a dependsOn change')`** — top-level suite; all four cases follow the same pattern: start a deferred call → mutate the `dependsOn` ref → flush → resolve the deferred call → assert the state is empty.
- **Test 1 — `fetchTarget` (with id)** — a record fetched under `'alice'` that resolves after switching to `'bob'` must not appear under either value, even if the user switches back to `'alice'` (the write was _dropped_, not deferred).
- **Test 2 — `fetchTarget` (id-less path)** — same guard on the branch that assigns an id internally.
- **Test 3 — `fetchAll`** — a full-list response arriving late must not seed any records.
- **Test 4 — `updateTarget`** — distinguishes the legitimate _optimistic_ write (applied before the `dependsOn` change) from the _late server response_ (must be dropped). Asserts the optimistic value is visible pre-switch, gone post-switch, and still gone after the server response lands.
- **`afterEach(clearAllInstances)`** — resets composable instances between tests.

## Relationships

- **`tests/structureRestApi/_helpers/harness.ts`** — supplies `makeComposable` (constructs the SUT with a `dependsOn` function), `clearAllInstances` (teardown), and `flush` (advances microtask queues so pending cancellations settle).
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — supplies `deferredApi`, which returns a `call` (a thunk the composable invokes) plus a `control.resolve(...)` handle, letting the test interleave the `dependsOn` mutation between request and response.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — provides the `USERS` array and the `IUser` type used as the record shape in every test.
- **`package.json`** — defines the test runner and `vue` peer dependency that the composable's `ref` / reactivity system relies on.

## Notes

- In Test 4, the optimistic write (`name: 'Optimistic'`) is _expected_ to apply before the `dependsOn` change; the guard under test is only the **server's** late response. The test explicitly asserts the optimistic value is present, then confirms it is torn down by the switch.
- The assertion "switching back to the old value still shows nothing" (Tests 1, 4) is intentional: it proves the late write was discarded at resolution time rather than queued for a future re-entry into the old context.
- `deferredApi` is the critical enabler — without it the test could not deterministically interleave a `dependsOn` mutation between the network call's dispatch and its resolution.
