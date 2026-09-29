---
source: tests/structureRestApi/_helpers/fakeApi.ts
sha256: 2ed17b0344bc339bb94c55b62a4cf33dc2ab6f8d300e8a24853ab886c8d41b15
generated_at: 2026-09-28T22:47:07.881781+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/_helpers/fakeApi.ts

## Purpose

Provides reusable fake `apiCall` implementations (all `jest.fn`-based) for the `structureRestApi` test suite. Each helper simulates a server round-trip so specs can assert call counts, control resolution timing, and verify data replacement without a real network.

## Key elements

- **`apiResolve(data?)`** – Returns a `jest.Mock` that, when called, resolves immediately with the supplied value (or `undefined`). The simplest "server says OK" stub.
- **`apiReject(message?)`** – Returns a `jest.Mock` that, when called, rejects with `new Error(message)`. Defaults to `"network error"`.
- **`apiVersioned<T>(base)`** – Returns a `jest.Mock` that resolves with a **fresh spread copy** of `base` plus an incrementing `version` number on every call. Useful for proving a refetch actually replaced prior state.
- **`IDeferred<T>`** – Interface exposing `promise`, `resolve`, and `reject` for externally-controlled promises.
- **`deferred<T>()`** – Creates an `IDeferred` via `Promise.withResolvers`. Resolution is entirely up to the test.
- **`deferredApi<T>()`** – Combines the above: returns `{ call, control }` where `call` is a `jest.Mock` that returns the deferred's promise, and `control` lets the test decide _when_ to resolve/reject. Used for latency and concurrency scenarios.

## Relationships

Every file in the `tests/structureRestApi/` tree (effects, intention, lifecycle specs) imports one or more of these helpers and passes the returned mock as the `apiCall` argument to the fetch/mutate methods under test. Sibling suites (`tests/browser/gc.spec.ts`, `tests/isLoading.spec.ts`) also consume the helpers for their own call-count assertions. No other production code depends on this module.

## Notes

- The file is intentionally **not** named `*.spec.ts` so Jest's `testMatch` skips it; it is a plain helper module.
- `apiVersioned` spreads `base` on every call (`{ ...base, version }`), so each resolved object is a **new reference**—specs can safely compare identities to detect replacement.
- `deferred` relies on `Promise.withResolvers` (ES2024 / TS 5.2+). Ensure the project's `lib` target supports it.
- All mocks are zero-argument (`[]` params) in their type signatures; pass no args when calling them in specs.
