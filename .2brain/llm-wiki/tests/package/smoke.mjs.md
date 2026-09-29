---
source: tests/package/smoke.mjs
sha256: fb7033c11b65e552148470b625cadbf54e4e6ef0eb6afa78698c5be4ef3bffb9
generated_at: 2026-09-28T22:43:52.565228+00:00
model: ollama:qwen3.8:27b
---

# tests/package/smoke.mjs

## Purpose

A plain-Node (no bundler, no ts-jest) smoke test that imports the package **by its own name** (`@guebbit/vue-toolkit`) to load the built `dist` exactly as an external consumer would. It verifies that the public export surface matches the frozen `exports.json` list and that two core composables actually execute and return sensible data against the real build output.

## Key elements

- **Export-surface diff** — Reads `./exports.json`, imports `@guebbit/vue-toolkit` (resolved via `package.json#exports` self-reference), and compares the sorted key sets. Exits `1` if any name is missing or unexpected, printing which side diverged.
- **`useStructureDataManagement` round-trip** — Runs inside a Vue `effectScope`, calls `addRecord({id:1, name:'Ada'})`, then asserts `getRecord(1)?.name === 'Ada'`. Stops the scope on completion.
- **`useStructureRestApi` round-trip** — Runs inside its own `effectScope` with an explicit `QueryClient` (no Vue plugin/injection). Calls `fetchTarget` with a trivial `Promise.resolve` and asserts both the return value and `getRecord(1)` contain the expected shape. Clears the `QueryClient` and stops the scope.
- **Shebang + top-level `await`** — Executable directly via `node tests/package/smoke.mjs`; all I/O (file read, dynamic import) uses top-level `await`.

## Relationships

- **package.json** — Node resolves `import('@guebbit/vue-toolkit')` through the `exports` field (self-reference), so this test exercises the exact mapping a consumer sees.
- **src/index.ts** — The built `dist` entry point; its named exports are what the diff check validates and what the two composables come from.
- **src/internal/recordMutations.ts** — Provides the `addRecord` / `getRecord` logic exercised by the `useStructureDataManagement` assertion.
- **src/internal/resourceActivity.ts**, **src/internal/settleCallbacks.ts**, **src/internal/queryRemoval.ts** — Internal modules invoked transitively when `useStructureRestApi.fetchTarget` and the query-cache subscriptions run.
- **tests/structureRestApi/\_helpers/harness.ts** — Unit-level test harness for the same `useStructureRestApi` composable; this smoke test covers the "does the built artifact actually work" gap that unit tests can't.
- **tests/internal/recordMutations.spec.ts** — Unit tests for the same record-mutation code path; this file confirms it survives the build pipeline.
- **docs/guide/testing.md** — Documents the testing strategy in which this smoke test sits (package-level vs. unit-level).

## Notes

- The `effectScope` wrappers are intentional: without them the composables' cache subscriptions would emit Vue warnings and leak, though that would **not** fail the script. Stopping the scopes keeps the process clean.
- `useStructureRestApi` receives an explicit `QueryClient` instance rather than relying on Vue-provided injection, because this script is not a Vue app.
- The export list is treated as a semver contract: any drift requires an intentional edit to `exports.json` **and** a `**BREAKING**` CHANGELOG entry (per the file's doc comment).
- Because this runs against `dist` (not `src`), a broken relative import or missing `package.json` subpath would surface here even if all unit tests pass.
