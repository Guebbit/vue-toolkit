---
source: tests/structureRestApi/intention/deep-scan-regressions.spec.ts
sha256: f4c2715a475da8516ae53a498ae7e6b8eb397c9c97ad8b0d6d9e622d938bee09
generated_at: 2026-09-28T22:49:49.417856+00:00
model: ollama:qwen3.8:27b
---

# tests/structureRestApi/intention/deep-scan-regressions.spec.ts

## Purpose

Regression guard suite for defects identified during the 5.0 deep-scan of the structure CRUD layer. Each `it` block encodes one specific race-condition or ordering bug (stale writes resurrecting deletes, cancelled reads settling watchers, cross-scope writes, etc.) so that a re-introduction of any of those defects fails the suite immediately.

## Key elements

- **`describe('INTENTION · deep-scan regressions')`** – top-level block; the `INTENTION` prefix signals these are defect-specific regression tests, not general coverage.
- **8 test cases** (listed in the file header comment):
    - numeric/string id equivalence
    - id-switch + same-tick invalidation isolation
    - cancelled read not settling a watcher
    - stale list not resurrecting a deleted record
    - failed older update not overwriting a newer one
    - failed update + synchronous scope change writing nothing
    - `null` response treated as "no record"
    - `resetRecords()` forcing a re-fetch on next `fetchAll`
    - failed `fetchOne` not clearing a newer selection
- **`IProductLike`** (local interface) – minimal `{ id, title }` shape used only by the final `useStructureCrudApi` test, distinct from the shared `IUser` fixture.
- **`afterEach(clearAllInstances)`** – ensures no composable state leaks between tests.

## Relationships

- **`src/composables/structureCrudApi.ts`** – the module under test. Most cases exercise it indirectly via the harness `makeComposable`; the final case calls `useStructureCrudApi` directly through `runTracked`.
- **`tests/structureRestApi/_helpers/harness.ts`** – supplies `makeComposable`, `clearAllInstances`, `flush`, `newTestClient`, `runTracked`; the primary scaffolding for every test.
- **`tests/structureRestApi/_helpers/fakeApi.ts`** – supplies `apiReject`, `apiResolve`, `deferred`, `deferredApi`; used to construct controllable promise chains that simulate in-flight / stale / failed API responses.
- **`tests/structureRestApi/_helpers/fixtures.ts`** – supplies `USERS` array and `IUser` type used as the record shape in most tests.
- **`package.json`** – provides Jest/Vitest runner configuration and script entry that discovers this spec file.

## Notes

- The file header comment is the authoritative "one line per defect" index; the `it` titles restate each guarantee. Keep them in sync when adding regressions.
- Test 7 deliberately passes `null` as the resolved value and carries an `eslint-disable-next-line unicorn/no-null` comment — removing the disable will fail lint.
- The last test (`fetchOne` selection) is the only one that exercises the real `useStructureCrudApi` composable with a custom `get` function and `resourceKey`; the others go through the harness abstraction. Do not assume they are interchangeable.
- `staleTime: 0` is set explicitly in tests 2–4 to guarantee that invalidation and re-fetch behave as the test expects; omitting it changes the assertion.
