---
source: src/internal/resourceKeys.ts
sha256: 44883513cb23a5a3c83648fc6d2d0fb7d55c0aff4bc6e5cd8894c3ee192437cb
generated_at: 2026-09-28T22:35:58.741962+00:00
model: ollama:qwen3.8:27b
---

# src/internal/resourceKeys.ts

## Purpose

Defines the canonical cache-key layout (`[resourceKey, kind, scope, ...parts, ...key]`) for every resource query, plus the predicate helpers that select entries by that layout. It exists so that key construction, scope matching, and alias-aware invalidation have a single source of truth shared across the resource layer.

## Key elements

- **`TResourceKind`** — union of the `kind` segment values (`'target' | 'all' | 'parent' | 'page' | 'search' | 'any' | 'idle'`).
- **`LIST_KINDS`** — subset of kinds that hold an id list; documented as what a successful mutation marks stale.
- **`ITargetEntry<T>`** — shape of a single-record cache entry; `data` is optional (absent on alias entries), `aliasOf` points at the canonical id when this entry is an alternate-key alias.
- **`IListCacheEntry<K>`** — shape of a list-shaped entry (`ids` plus extra fields like `totalItems`).
- **`IKeyed`** — minimal interface (`queryKey: readonly unknown[]`) accepted by the filter predicates; satisfied by TanStack `Query` objects.
- **`scopeOf(queryKey)`** — extracts the scope snapshot (`queryKey[2]`) from a key this resource built.
- **`createResourceKeys(resourceKey, dependsOn)`** — factory returning:
    - `target(id, scope?)` — key for a single record (id coerced to string).
    - `parent(parentId, scope?, key?)` — key for a parent's child list.
    - `idle()` — key for the no-id watcher placeholder; never fetched.
    - `entry(kind, scope, parts?, key?)` — generic key for any other list/search entry.
    - `inScope(scope, kinds?)` — predicate matching a resource's entries under a given scope snapshot (serialized once via `stableKey`).
    - `refersTo(id, scope)` — predicate matching a record's canonical entry **or** any alias entry pointing at it.
- **`IResourceKeys`** — `ReturnType<typeof createResourceKeys>`; the type of the object the factory returns.

## Relationships

- **`src/internal/plainData.ts`** — imports `stableKey`, which `inScope` and `refersTo` use to serialize scope snapshots for content-equality comparison.
- **`src/internal/restResource.ts`** — the module that builds these keys per resource; its header documents the alias rule that `refersTo` implements (an update/delete must also touch alias entries resolving to the same record).
- **`src/internal/resourceMutations.ts`** — consumes `LIST_KINDS` to determine which list entries a successful mutation must mark stale; uses `refersTo` to invalidate a record and all its aliases.
- **`src/internal/queryRecordStore.ts`** — passes its filter predicates (typed as `IKeyed`) to the `inScope` / `refersTo` predicates returned by `createResourceKeys`.
- **`src/internal/parentRelations.ts`** — uses the `parent` key builder and `LIST_KINDS` for parent-child relationship queries.
- **`src/composables/structureSearchApi.ts`** — higher-level composable that relies on the key layout (likely via `entry` with kind `'search'`) for its cache entries.

## Notes

- **Scope is baked into the key at fetch time.** An answer always belongs to the scope in its _own_ key, not to whatever `dependsOn()` reads when the answer lands. Whether a late answer may still be stored is decided by a separate live-scope registry, not by this module.
- **Id is always stringified in the key.** `target(5)` and `target('5')` produce identical keys, so a numeric DB id and a route-param string address the same cache slot.
- **Alias entries have no `data`.** An `ITargetEntry` fetched via an alternate key (e.g. a slug) stores only `aliasOf`; the record body lives under the canonical id's entry. Code reading `query.state.data` must handle the absent-`data` case.
- **`idle` is a distinct kind, not a subset of another.** No caller-chosen `key` segments can collide with it because it has no `parts` or `key` tail.
- **`inScope` serializes the expected scope once** (via `stableKey`) and compares against each query's serialized scope, avoiding repeated serialization in a filter loop.
