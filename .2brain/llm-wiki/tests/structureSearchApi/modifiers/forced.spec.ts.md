---
source: tests/structureSearchApi/modifiers/forced.spec.ts
sha256: b872f892d3772f7c0fed5e11c82b13361486e3cefdc9afc005ea2cff09abda25
generated_at: 2026-09-28T23:10:48.025609+00:00
model: ollama:qwen3.8:27b
---

# tests/structureSearchApi/modifiers/forced.spec.ts

## Purpose

Tests the `forced` modifier on the structure search API. Verifies that passing `{ forced: true }` bypasses a still-fresh cache entry and re-hits the API — both for a one-shot `fetchSearch` call and for a `search()` invocation inside a `watchSearch` session.

## Key elements

- **`make()`** — factory that calls `makeSearchComposable<IArticle, number>()` to produce a fresh composable instance per test.
- **`afterEach(clearAllInstances)`** — tears down all composable instances after each test to prevent cross-test contamination.
- **`describe('MODIFIER · forced')`** — contains two test cases:
    - _`fetchSearch: forced re-hits the API`_ — calls `fetchSearch` twice with the same key; the second call passes `{ forced: true }` in the options argument and asserts the mock API was invoked a second time.
    - _`watchSearch: forced, search() back to a cached search resolves the server's new answer`_ — sets up a `watchSearch` with `{ forced: true }`, cycles the `category` filter away and back to the original value, then asserts `search()` still resolved the server's third (newest) answer rather than a cached one.

## Relationships

- **`tests/structureSearchApi/_helpers/harness.ts`** — supplies `makeSearchComposable`, `clearAllInstances`, and `flush`, which are the primary test-harness primitives used throughout.
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — provides `apiResolve`, a helper that wraps a response object in a `jest.fn` so call-count assertions can be made.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — provides `buildArticles` (generates deterministic article arrays) and the `IArticle` type used as the composable's item type.

## Notes

- The second test relies on the invariant stated in the inline comment: `search()`'s own `forced` flag defaults to `false`; it may add forcing to a _single_ search call but must never permanently lift the watcher-level `forced` flag. The test guards against a regression where a cached search would be treated as fresh again after the filter cycles back.
- The `apiResolve` mock returns the _same_ array for both `fetchSearch` calls; the assertion is on **call count**, not on data identity, to confirm the cache was actually bypassed.
