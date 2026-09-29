---
source: src/internal/freshnessChecks.ts
sha256: a818c2ea1c602b7044e334838d72c1a8e90ec34a562bde62e903c65058d1ac96
generated_at: 2026-09-28T22:32:30.207992+00:00
model: ollama:qwen3.8:27b
---

# src/internal/freshnessChecks.ts

## Purpose

Provides pre-flight freshness checks that answer "would this REST call be served from cache, or hit the network?" using only the current Vue Query cache state—without issuing a network request. Each resource instantiates its own set of checks via `createFreshnessChecks`, which binds the resource's query keys, scope predicates, and default stale-time into ready-to-call predicates.

## Key elements

- **`IFreshnessContext`** — The contract the owning resource must satisfy: `queryClient`, `keys` (key layout), `dependsOn` (scope snapshot), and `staleTime` (default freshness window in ms).
- **`createFreshnessChecks<K, P>(context)`** — Factory that returns all check functions for one resource. Generics `K`/`P` constrain id types to `string | number`.
- **`isFresh(queryKey, custom?)`** — Core lookup: finds the exact key in the query cache and returns whether the entry is not stale by time.
- **`checkTarget(id, settings?)`** — Would a `fetchTarget` call be cache-served?
- **`checkAll(settings?)`** — Would `fetchAll` be cache-served?
- **`checkByParent(parentId, settings?)`** — Would `fetchByParent` be cache-served?
- **`checkPaginate(page, pageSize, settings?)`** — Would `fetchPaginate` be cache-served? Defaults: page 1, size 10.
- **`checkAny(key?, settings?)`** — Would `fetchAny` be cache-served? Returns `false` if `key` is omitted (keyless fetchAny never caches).
- **`classifyMultiple(ids, settings?)`** — Splits an id array into `{ cachedIds, expiredIds }`. Treats `forced: true` as "always stale."
- **`checkMultiple(ids, settings?)`** — Thin passthrough to `classifyMultiple`; identical return shape.

## Relationships

- **`src/internal/resourceKeys.ts`** — Supplies the `IResourceKeys` type used in `IFreshnessContext.keys`. All check functions delegate key construction to this interface (`keys.target`, `keys.entry`, `keys.parent`).
- **`src/composables/structureRestApi.ts`** — Supplies the `IFetchSettings` type; each check function accepts a `Pick<IFetchSettings, …>` so callers pass the same settings shape they'd pass to the actual fetch.
- **`src/internal/restResource.ts`** — The consuming side: the resource object that owns queries provides the `IFreshnessContext` and calls `createFreshnessChecks` to expose the check bundle to its API.

## Notes

- There is intentionally **no `forced` variant** on the single-item checks—`classifyMultiple` handles `forced` by treating every id as stale.
- `checkAny` is the only check that can return `false` unconditionally (keyless case); all other checks depend solely on cache presence.
- `dependsOn()` is called at check-invocation time (not at factory time), so a scope change is reflected in the next check call.
- `checkMultiple` adds no logic beyond `classifyMultiple`; both are exported so callers can pick the name that reads better in their context.
