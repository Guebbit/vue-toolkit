# `useStructureRestApi` test suite

Tests for `useStructureRestApi` (`src/composables/structureRestApi.ts`, implemented under
`src/internal/`): records, lists and pages cached in one TanStack `QueryClient`, optimistic
mutations, and active `watch*` queries. `tests/structureSearchApi/` mirrors this layout for the
search layer and reuses these helpers.

## Layout

Folders classify by **subject**. A regression test lives with the feature it constrains: it
states a contract, not the story of a bug.

| Folder                 | What it proves                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_helpers/`            | Factories, fakes and fixtures (below). Not `*.spec.ts`, so Jest never runs them.                                                                                                                                          |
| `unit/`                | One method at a time: fetch*, watch*, mutations, check\*, `isLoading` / `loading`, setRecords.                                                                                                                            |
| `staleTime/`           | Freshness over time on a **fake clock**: just under vs just past `staleTime`, per-call overrides, concurrency.                                                                                                            |
| `pagination/`          | Client-side paging over the dictionary, server pages via `fetchAll` keys, and `fetchPaginate`.                                                                                                                            |
| `modifiers/`           | Per-call settings: `forced`, `merge`, `partial`, and `isLoading` under rejection and concurrency.                                                                                                                         |
| `effects/`             | `isLoading()` for every method, and one on/off cycle for a burst of overlapping calls.                                                                                                                                    |
| `intention/`           | Multi-call scenarios: CRUD against a fake server, list invalidation, cross-method seeding, shared clients.                                                                                                                |
| `lifecycle/`           | Scope teardown, `dependsOn` switches and late answers, `maxRecords`, and dropping queries a watcher observes.                                                                                                             |
| `model/`               | Generated command sequences (`fast-check`), settled in a scheduler-picked order: generalises the lifecycle race specs above into thousands of them. See its file header for the invariants and the documented exceptions. |
| `served-value.spec.ts` | Asserts the _value_ served on cache hits and refetches, not merely that the network was skipped.                                                                                                                          |

## Running

```bash
npm test                                      # whole repo
npm run test:target                           # just tests/structureRestApi
npx jest --config jest.config.cjs tests/structureRestApi/staleTime   # one folder
```

## Helpers (`_helpers/`)

- **`harness.ts`**
    - `makeComposable<T, K>(options?)` — resourceKey `'resource'`, 1-hour `staleTime`, its own
      `newTestClient()`, built in its own effect scope and tracked.
    - `makeShared(resourceKey?)` — two composables on one client and resourceKey (`a`, `b`,
      `make` for more).
    - `runTracked(factory)` — any other composable, in a tracked scope.
    - `runInjected(client, factory)` / `makeInjected(client, options?)` — the same, with the
      client found through `useQueryClient()` injection (`VueQueryPlugin`).
    - `newTestClient()` — no retries, always online. Never hand-roll a `QueryClient`.
    - `flush(rounds = 3)` — lets promises, Vue's scheduler and TanStack's batched notifications
      settle. Never hand-roll a flush.
    - `clearAllInstances()` — the teardown every spec runs in `afterEach`.
- **`fakeApi.ts`** — `apiResolve` / `apiReject` / `apiVersioned` (call-counting stubs), and
  `deferred()` / `deferredApi()` to decide when a call settles.
- **`fakeServer.ts`** — `createServer(seed)`: a stateful in-memory REST server whose methods
  return `apiCall` closures, with a `calls` counter.
- **`fixtures.ts`** — `IUser` / `IProduct` / `IArticle`, builders, and a few named records.
- **`time.ts`** — `useFakeClock()`, `advance(ms)` (flushes microtasks too), `restoreClock()`.

## Conventions

- **Every spec tears down what it builds**: `afterEach(clearAllInstances)`. It stops each tracked
  instance's scope — and every watcher a test started on it, since the harness runs `watch*`
  inside that scope — then clears its client.
- **Jest runs as a TanStack "server"** (Node): `gcTime` defaults to `Infinity` there, and the
  plugin never mounts the client. Browser-only behaviour (garbage collection, focus refetch) is
  asserted through explicit options, never assumed from defaults.
- **Fake clock only where time matters.** `flush()` waits on real timers: keep fake-clock tests in
  their own `describe` with `useFakeClock()` / `restoreClock()`.
- **A known source bug** gets a failing test marked `it.failing`, with a comment naming the cause.
  Remove `.failing` in the change that fixes it.
- **`maxRecords` is a critical-mass backstop, not a cache policy.** Records are never evicted for
  being old: stale data keeps a list rendered while the fresh copy downloads. Records and parent
  lists get `gcTime: Infinity`; growth is bounded by `maxRecords` (`lifecycle/maxRecords*.spec.ts`)
  and by explicit `resetAll()` / `resetRecords()`.
- **`*.property.spec.ts` files** (under `model/`) use `fast-check`, configured once for the whole
  repo in `tests/_setup/fastCheck.ts`. `FC_NUM_RUNS` (default 50, 25 for `model/`) controls how many
  cases run; a failure prints its own `seed` — rerun with `FC_SEED` set to it to deterministically
  reproduce the same run, shrink included. See `docs/guide/testing.md` for the full walkthrough.
