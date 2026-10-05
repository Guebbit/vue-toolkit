# TODO

## 6.0 — public API consistency (breaking)

Each item renames or reshapes public API, so they wait for the next major and ship together, each
with a **BREAKING** `CHANGELOG` entry and a migration note.

### Naming

- [ ] **`identifier` vs `identifierKey`** — the same option is `identifier` in
      `useStructureDataManagement` and `identifierKey` in `useStructureRestApi` (renamed while
      destructuring in `restResource.ts`). Pick one name everywhere.
- [ ] **`size` vs `pageSize`** — `searchGet` / `fetchSearch` / `checkSearch` take `size`;
      `fetchPaginate`, `checkPaginate`, `ISearchFetchContext` and the CRUD layer say `pageSize`.
      Use `pageSize` everywhere.
- [ ] **Page-size defaults differ** — `fetchSearch` defaults to the current `pageSize`, while
      `fetchPaginate` / `checkPaginate` / `fetchPage` hard-code `10`. Use the current `pageSize`
      everywhere.
- [ ] **`Options` vs `Settings`** — `I*Options` (REST, CRUD, form) vs `IAsyncActionSettings` /
      `ILivenessProbeSettings`. Search and CRUD also name their resource options parameter
      `settings`, which collides with per-call `settings`. Use `Options` for setup and `Settings`
      for per-call only.
- [ ] **`isLoading` means three things** — a function of a segment array on a resource, a
      `ComputedRef` of string prefixes from `useIsLoading`, a function of string prefixes on
      `useCoreStore`. Give each a distinct name or a single shape.
- [ ] **Read-method names** — `searchGet` vs `getRecord` / `getListByParent`; `isPageCached` vs
      the `check*` family.
- [ ] **`EToastType.DANGER = 'error'`** — the key and the value disagree.
- [ ] **CRUD `fetchList` / `watchList` are not counterparts** — one runs the `list` operation, the
      other `search`. Rename (`watchSearch`) or align them.

### Signatures

- [ ] **One shape for a search `apiCall`** — `fetchSearch` passes a single context object;
      `watchSearch` and CRUD's `search` operation pass positional
      `(filters, page, pageSize, context)`. Use the context object everywhere.
- [ ] **Generic parameter order** — search is `<T, K, P, F>`, CRUD is `<T, K, F, C, U, O, P>`.
      With no partial inference in TypeScript, typing the filters forces callers to spell out
      `K`/`P` too. Put `F` second in both.
- [ ] **Positional lists → option objects:**
    - [ ] `useStructureDataManagement(identifiers, delimiter, recordStore, relationStore)`
    - [ ] `useStructureFormValidation(initialData, schema, options)` — fold `schema` into options
    - [ ] `addMessage(message, type, timeout = -1, options)`
    - [ ] `fetchSearch(apiCall, filters, page, size, settings)`
    - [ ] REST `createTarget(apiCall, dummyData, settings)` — CRUD already moved `dummyData` into
          settings
- [ ] **Bare booleans → named options:**
    - [ ] `editRecord(data, id, create)`
    - [ ] `handleSubmit(fn, withValidation)`
    - [ ] `search(forced)`

### Types

- [ ] **Read-only reactive state** — `isSubmitting` and `useAsyncAction`'s `loading` / `error` are
      writable refs, so a consumer can bypass the submit lock. Expose them as `Readonly<Ref<…>>`.
