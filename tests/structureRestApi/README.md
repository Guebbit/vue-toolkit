# `useStructureRestApi` test suite

Categorized tests for `src/composables/structureRestApi.ts` — the REST wrapper that
uses TanStack Query as its cache / freshness / revalidation engine.

## Layout

| Folder | What it proves |
| --- | --- |
| `_helpers/` | Shared fixtures, composable factories, fake API stubs, a stateful fake REST server, and fake-clock helpers. **Not** `*.spec.ts`, so Jest ignores them. |
| `unit/` | Direct per-function contracts — each fetch/mutate/search/loading function in isolation. |
| `ttl/` | Freshness over time with a **fake clock**: explicit *valid* (`<TTL`) vs *stale* (`>TTL`) cases per method, mixed per-id staleness, mutation↔freshness interplay, and concurrency dedupe. |
| `search/` | Filter params as cache keys, per-page and per-pageSize buckets, server totals, and `searchCleanup` memory bounding. |
| `pagination/` | Client-side (offline) paging, server-side paging (`fetchAll` per page), and `fetchPaginate`. |
| `modifiers/` | The request "versions": `forced`, `loading` (internal/external/postfix/off), `merge`, `mismatch`. |
| `intention/` | Multi-call scenarios: search-as-you-type journeys, full CRUD lifecycle vs a fake server, cross-method cache seeding, parent relations, shared client. |
| `strict/` | **Harsh** tests: assert the *value* served (not just "network skipped"), plus one **expected-fail** test per known defect. These flip green as the code is hardened. |

## Running

```bash
npm test                       # whole repo
npm run test:target            # just tests/structureRestApi
npx jest tests/structureRestApi/ttl   # one category
```

## Helper contracts (`_helpers/`)

- **`harness.ts`** — `makeComposable<T,K>(opts?)` (tracked, 1h TTL by default),
  `makeExternalLoading()` (returns `{ c, store }`), `makeShared()` (two composables on one
  `QueryClient` + `loadingKey`). Every spec calls `afterEach(clearAllInstances)` to stop
  TanStack's gc timers.
- **`fakeApi.ts`** — `apiResolve`/`apiReject` (call-counting), `deferred()`/`deferredApi()`
  for concurrency & controlled latency.
- **`fakeServer.ts`** — `createServer(seed)` → stateful `list/get/many/search/create/update/remove`
  closures plus a `calls` counter, used by the intention scenarios.
- **`time.ts`** — `useFakeClock()`, `advance(ms)` (async, flushes microtasks), `restoreClock()`.

## Expected failures (they pin real defects, not test mistakes)

These are the tests written to FAIL against the current code. Each encodes behaviour a
consumer is entitled to assume; fixing the defect flips the test green.

| Test | Defect |
| --- | --- |
| `intention/cross-method-cache.spec.ts › "BUG: fetchTarget RETURNS the item…"` | `{ data }` wrapping — warm `fetchTarget` resolves `undefined` |
| `strict/served-value.spec.ts › "EXPECTED FAIL — fetchTarget (warm from a list fetch)…"` | same wrapping bug, value-level |
| `strict/known-defects.spec.ts › DEFECT 1` | `loading` not ref-counted (flickers under concurrency) |
| `strict/known-defects.spec.ts › DEFECT 2` | optimistic-update rollback is lossy (merge can't remove added fields) |
| `strict/known-defects.spec.ts › DEFECT 3` | `deleteTarget` ignores `lastUpdateKey` |
| `strict/known-defects.spec.ts › DEFECT 4` | `searchKeyGen` collides on nested-object filters |
| `strict/known-defects.spec.ts › DEFECT 5` | `itemDictionary` never pruned (unbounded growth) |

## Also know

- **The `ttl/` specs assume TanStack resolves via microtasks (no internal `setTimeout`).**
   With `retry:false` + `networkMode:'always'` that holds, so `await advance(ms)` + awaiting the
   fetch is enough. If a `ttl/*` test ever *times out* (rather than asserting), add
   `await jest.advanceTimersByTimeAsync(0)` after the awaited fetch — it's a timing artifact, not
   a logic failure.

## Deliberate coverage choice

Most cache-hit tests assert **"the network was not called"**, not the returned value — because the
`{ data }` bug makes the returned value unreliable on a warm cache. The `strict/` folder is the
counter-weight: it asserts the actual value served and pins each defect. Once the wrapping bug is
fixed, the value-level assertions in `strict/served-value.spec.ts` should be promoted into the main
suites so stale/wrong cached values are caught everywhere, not just there.
