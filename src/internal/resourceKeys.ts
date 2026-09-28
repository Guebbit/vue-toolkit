/**
 * The cache-key layout every resource query follows, and the predicates that select by it.
 *
 * `[resourceKey, kind, scope, ...parts, ...key]`: `kind` says what the entry holds (one record,
 * a list of ids, anything else), `scope` is the `dependsOn()` snapshot it was fetched under.
 * Record and parent ids are keyed as strings: one id, one entry, whatever its JS type.
 * A query is "in scope" when its scope equals a given snapshot by content (see `stableKey`), so
 * every question of the form "this resource, this user, this language" is one predicate.
 *
 * An answer belongs to the scope baked into ITS OWN key (`scopeOf`), fixed for that query's whole
 * life — never to whatever `dependsOn()` reads later, which may have moved on by the time the
 * answer lands. Whether a late answer may still be stored is a question for the LIVE-SCOPE
 * registry (`./scopeRegistry`), not this module: a scope another instance still shows is live even
 * once the fetching instance's own `dependsOn` has moved past it.
 *
 * @module internal/resourceKeys
 */
import type { Query } from '@tanstack/vue-query';
import { stableKey } from './plainData.js';

/** What a query entry holds: one record (`target`), a list of ids, or anything else (`any`). */
export type TResourceKind = 'target' | 'all' | 'parent' | 'page' | 'search' | 'any';

/** The kinds that hold a list of ids: what a successful mutation marks stale. */
export const LIST_KINDS: readonly TResourceKind[] = ['all', 'parent', 'page', 'search'];

/**
 * A record's cache entry. Wrapped, so a record that is legitimately `undefined` still reads as
 * "cached" rather than "never fetched". An entry fetched by an id other than the record's own
 * (an alternate key, e.g. a slug) holds no `data` of its own: it is an alias, `aliasOf` the id the
 * record actually lives under, so the record is never duplicated across two cache entries.
 */
export interface ITargetEntry<T> {
    /** The record, as last stored. Absent when this entry is an alias — see `aliasOf`. */
    data?: T | undefined;

    /** The id this entry's record actually lives under, when this entry is only an alias. */
    aliasOf?: string;
}

/** A list-shaped cache entry: the ids a list call returned, plus whatever travels with them. */
export interface IListCacheEntry<K> {
    /** The listed record ids, in the order the server returned them. */
    ids: K[];

    /** Extra data stored alongside the ids (a search page's `totalItems`). */
    [extra: string]: unknown;
}

/** Anything carrying a query key: a TanStack `Query`, or what its filter predicates receive. */
export interface IKeyed {
    /** The query key. */
    queryKey: readonly unknown[];
}

/**
 * The scope segment of a query key this resource built (`queryKey[2]`) — the scope an ANSWER
 * belongs to. Fixed for the query's whole life, unlike `dependsOn()` read again later: a fetch
 * started under scope S keeps S in its own key even once `dependsOn()` has moved on, so an answer
 * is always storable under the scope it was actually asked for, not whatever is current by the
 * time it lands (see the module header's scope rule).
 *
 * @param queryKey - a query key this resource built
 * @returns its scope snapshot
 */
export const scopeOf = (queryKey: readonly unknown[]): unknown[] => queryKey[2] as unknown[];

/**
 * Key builders and scope predicates for one resource.
 *
 * @param resourceKey - first segment of every key the resource makes
 * @param dependsOn - reads the current scope snapshot
 * @returns the builders and predicates
 */
export const createResourceKeys = (resourceKey: string, dependsOn: () => unknown[]) => {
    /**
     * `[resourceKey, 'target', scope, id]`: a record's one and only entry. The id is keyed as a
     * string, so `5` and `'5'` (a route param, say) address the same record.
     *
     * @param id - the record id
     * @param scope - the scope snapshot; the current one when omitted
     * @returns the query key
     */
    const target = (id: unknown, scope: unknown[] = dependsOn()): unknown[] => [
        resourceKey,
        'target',
        scope,
        String(id)
    ];

    /**
     * `[resourceKey, 'parent', scope, parentId, ...key]`: a parent's list of children. The parent
     * id is keyed as a string, like a record id.
     *
     * @param parentId - the parent id
     * @param scope - the scope snapshot; the current one when omitted
     * @param key - the caller's bucket segments
     * @returns the query key
     */
    const parent = (
        parentId: unknown,
        scope: unknown[] = dependsOn(),
        key: readonly string[] = []
    ): unknown[] => [resourceKey, 'parent', scope, String(parentId), ...key];

    /**
     * `[resourceKey, kind, scope, ...parts, ...key]`: any entry other than a record.
     *
     * @param kind - what the entry holds
     * @param scope - the scope snapshot it belongs to
     * @param parts - the call's own identity (a parent id, a page number, a filters key)
     * @param key - the caller's bucket segments
     * @returns the query key
     */
    const entry = (
        kind: TResourceKind,
        scope: unknown[],
        parts: readonly unknown[] = [],
        key: readonly string[] = []
    ): unknown[] => [resourceKey, kind, scope, ...parts, ...key];

    /**
     * Predicate selecting this resource's queries under `scope`, optionally only some kinds.
     * The snapshot is serialized once per predicate, not once per query tested.
     *
     * @param scope - the scope snapshot to match
     * @param kinds - the kinds to keep; every kind when omitted
     * @returns the predicate, for TanStack filters or `Array.filter`
     */
    const inScope = (scope: unknown[], kinds?: readonly TResourceKind[]) => {
        const expected = stableKey(scope);
        return (query: IKeyed): boolean =>
            query.queryKey[0] === resourceKey &&
            (kinds === undefined || kinds.includes(query.queryKey[1] as TResourceKind)) &&
            stableKey(query.queryKey[2]) === expected;
    };

    /**
     * Predicate selecting `scope`'s `target` entry that IS `id`'s own record, or an alias entry
     * pointing at it — "does this entry refer to id, directly or through one alias hop". Reaches
     * every pointer to a record when it changes: an update/delete by an alternate key, a removal,
     * or an invalidation must also touch the aliases that resolve to the same record (see A2 in
     * `restResource.ts`'s module header).
     *
     * @param id - the record's own (already resolved) id — never an alias itself
     * @param scope - the scope snapshot to match
     * @returns the predicate
     */
    const refersTo = (id: unknown, scope: unknown[]) => {
        const matchesScope = inScope(scope, ['target']);
        const key = String(id);
        return (query: Query): boolean =>
            matchesScope(query) &&
            (query.queryKey[3] === key ||
                (query.state.data as ITargetEntry<unknown> | undefined)?.aliasOf === key);
    };

    return { target, parent, entry, inScope, refersTo, scopeOf };
};

/** Key builders and scope predicates of one resource (what `createResourceKeys` returns). */
export type IResourceKeys = ReturnType<typeof createResourceKeys>;
