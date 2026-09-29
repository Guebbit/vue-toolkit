---
source: tests/structureRestApi/lifecycle/piniaSetupStoreInjection.spec.ts
sha256: aef5411ee8861397cd10bb3800402f702f5d70c33807325224db65fccfbc597d
generated_at: 2026-09-28T22:54:18.526555+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/lifecycle/piniaSetupStoreInjection.spec.ts

## Purpose

Verifies that `useStructureRestApi`, when called from inside a Pinia **setup-style** store, resolves its `QueryClient` via Vue's `inject()` mechanism in both supported lifecycle contexts: (1) within a mounted component's `setup()`, and (2) outside any component (e.g. from a router guard), where Pinia ≥ 2.1's `app.runWithContext` wrapper is required. It exists to guard the `pinia@>=2.1` peer-dependency floor.

## Key elements

- **`renderNothing`** — trivial render function (`h('div')`) used as the root render of the test app; no UI is actually asserted on.
- **`describe('LIFECYCLE · a resource inside a Pinia setup store')`** — top-level suite; `afterEach` unmounts the app created by whichever test ran.
- **Test 1: "finds VueQueryPlugin's client through injection, not a fallback of its own"** — mounts a full app (Pinia + VueQueryPlugin) and calls the store from inside `setup()`. Asserts `store.queryClient` is the exact instance passed to the plugin.
- **Test 2: "finds VueQueryPlugin's client via app.runWithContext when built outside a component (the pinia >=2.1 floor)"** — creates the app, registers Pinia and VueQueryPlugin, but never mounts a component. Calls `useResourceStore(pinia)` directly with no ambient component instance. Asserts the same identity check. This is the case Pinia < 2.1 cannot support.

## Relationships

- **`src/composables/structureRestApi.ts`** — the system under test; `useStructureRestApi` is the composable whose internal `inject()` call this spec exercises.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — provides the `IUser` type used as the generic resource type in both store definitions.
- **`package.json`** — documents the `pinia` peer dependency floor of `2.1`; Test 2 is the regression guard for that exact constraint.

## Notes

- The `@jest-environment` docblock targets `@stryker-mutator/jest-runner/jest-env/jsdom` rather than plain `jsdom`. This is required for Stryker's coverage-instrumented mutation testing of the file; plain `jsdom` also works for regular `npm test` runs.
- Neither test renders a visible UI; the assertions are purely on the store's resolved `queryClient` reference.
- Test 2 deliberately omits `app.mount()` — `app.use()` alone sets `pinia._a` (the app reference) and registers `provide()`, which is all `app.runWithContext` needs.
