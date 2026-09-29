---
source: tests/structureSearchApi/unit/checkSearch.spec.ts
sha256: 0bbb5d996354cc17f661172451aaeb11701fd5122ee5fcf292f05ea56b0d45aa
generated_at: 2026-09-28T23:13:00.492767+00:00
model: ollama:qwen3.8:27b
---

# tests/structureSearchApi/unit/checkSearch.spec.ts

## Purpose

Unit tests for `checkSearch`, the pre-flight freshness guard that tells the caller whether a `fetchSearch` result for a given filter/page/pageSize tuple is already cached. It verifies the three core behaviors: cold cache returns `false`, the same parameters return `true` after a matching `fetchSearch`, and a different page is treated as a distinct cache bucket.

## Key elements

- **`make()`** — Local shorthand that calls `makeSearchComposable<IUser, number>()` to produce a fresh composable under test.
- **`afterEach(clearAllInstances)`** — Resets all composable instances between tests so state never leaks.
- **Test: "false on a cold cache, true after fetchSearch…"** — Asserts the full lifecycle: `checkSearch` is `false` before any fetch, `true` after `fetchSearch` with the same filters/page/pageSize, and `false` again for page 2 of the same search.

## Relationships

- **`tests/structureSearchApi/_helpers/harness.ts`** — Source of `makeSearchComposable` and `clearAllInstances`; this spec is entirely built on that harness.
- **`tests/structureRestApi/_helpers/fakeApi.ts`** — Provides `apiResolve`, used to simulate a resolved API payload without a network call.
- **`tests/structureRestApi/_helpers/fixtures.ts`** — Supplies the `IUser` type parameter that the composable is instantiated with.

## Notes

- The file header explicitly scopes out the `staleTime` boundary: that logic is covered in `staleTime/staleTime.check.spec.ts`. Do not add time-based assertions here.
- Only **one** test case exists in this file; the three assertions in it collectively cover the "hot / cold / different-bucket" matrix.
- The test casts the fixture object `as IUser`, so the harness does not enforce a strict shape beyond the type parameter.
