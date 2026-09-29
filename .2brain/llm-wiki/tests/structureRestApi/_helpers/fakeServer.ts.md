---
source: tests/structureRestApi/_helpers/fakeServer.ts
sha256: 603e407611f1fdfe577debde0ad9b104be721918c850aa19ac060d5b5ec72fee
generated_at: 2026-09-28T22:47:26.927428+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/_helpers/fakeServer.ts

## Purpose

A stateful, in-memory REST server stub for the "intention" scenario specs. It simulates full CRUD plus search/pagination over a `Map`-backed store, returns `() => Promise` thunks that conform to the `apiCall` contract the code under test expects, and records every hit in a `calls` counter so tests can assert whether the network was (or was not) touched.

## Key elements

- **`IServerOptions`** – optional `latency` (ms); when > 0, every response is delayed via `setTimeout` (requires Jest fake timers).
- **`IServerCalls`** – counter shape (`list`, `get`, `search`, `create`, `update`, `remove`) exposed on the returned server for assertions.
- **`createServer<T extends { id: number }>(seed?, options?)`** – factory that returns:
    - `store` – the live `Map<number, T>` (inspectable/mutable by tests).
    - `calls` – the mutable `IServerCalls` object.
    - **`list()`** – thunk returning all items (increments `calls.list`).
    - **`get(id)`** – thunk returning a single item or `undefined` (increments `calls.get`).
    - **`many(ids)`** – thunk returning items whose id is in `ids`; **also increments `calls.get`**, not a separate counter.
    - **`search(predicate?, page?, pageSize?)`** – thunk returning a paginated slice of matched items (increments `calls.search`).
    - **`create(data)`** – thunk; auto-assigns `id` from an internal counter if absent, stores, echoes (increments `calls.create`).
    - **`update(id, patch)`** – thunk; shallow-merges patch into the stored item, echoes (increments `calls.update`).
    - **`remove(id)`** – thunk; deletes and returns `{ id }` (increments `calls.remove`).
- **`settle<R>(value)`** – internal helper that either resolves immediately or after `options.latency` ms.

## Relationships

- **`tests/structureRestApi/intention/crud-lifecycle.spec.ts`** – consumes `createServer` to exercise the full create → read → update → delete lifecycle and asserts on `calls` counters.
- **`tests/structureRestApi/intention/list-invalidation.spec.ts`** – uses the server to verify that `list` is (or is not) re-invoked after mutations, relying on `calls.list`.
- **`tests/structureRestApi/model/commandSequence.property.spec.ts`** – feeds property-generated command sequences through the server's method thunks to validate invariants.
- **`tests/structureSearchApi/intention/search-journey.spec.ts`** – exercises the `search` thunk (predicate, pagination) to test search-specific flows.

## Notes

- **Double-closure pattern:** every method is `fn(...) => () => Promise<…>`. The outer call is test setup; the inner thunk is the `apiCall` the system under test invokes. Do not collapse the nesting.
- **`many` shares the `get` counter.** A spec that asserts `calls.get === 1` will count both single and batch reads.
- **Latency requires fake timers.** If `options.latency > 0` and you forget `jest.useFakeTimers()` + `jest.advanceTimersByTime`, the promise never settles.
- **File is intentionally not `*.spec.ts`.** It lives in `_helpers/` so Jest's `testMatch` skips it; renaming to a spec file would break the build.
- **`autoId` starts at `max(seed ids)`.** Creating without an explicit id yields `maxSeedId + 1`, not `1`.
