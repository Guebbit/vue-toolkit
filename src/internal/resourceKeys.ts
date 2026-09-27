/**
 * The cache-key layout every resource query follows, and the predicates that select by it.
 *
 * `[resourceKey, kind, scope, ...parts, ...key]`: `kind` says what the entry holds (one record,
 * a list of ids, anything else), `scope` is the `dependsOn()` snapshot it was fetched under.
 * Record and parent ids are keyed as strings: one id, one entry, whatever its JS type.
 * A query is "in scope" when its scope equals a given snapshot by content (see `stableKey`), so
 * every question of the form "this resource, this user, this language" is one predicate.
 *
 * @module internal/resourceKeys
 */
import { stableKey } from './plainData.js';

/** What a query entry holds: one record (`target`), a list of ids, or anything else (`any`). */
export type TResourceKind = 'target' | 'all' | 'parent' | 'page' | 'search' | 'any';

/** The kinds that hold a list of ids: what a successful mutation marks stale. */
export const LIST_KINDS: readonly TResourceKind[] = ['all', 'parent', 'page', 'search'];

/**
 * A record's cache entry. Wrapped, so a record that is legitimately `undefined` still reads as
 * "cached" rather than "never fetched".
 */
export interface ITargetEntry<T> {
    /** The record, as last stored. */
    data: T | undefined;
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
     * True while `scope` still equals the current `dependsOn()`. A late answer, fetched for a
     * user or language that is no longer current, fails this and is not stored.
     *
     * @param scope - the snapshot a call started under
     * @returns whether it is still the current scope
     */
    const isCurrent = (scope: unknown[]): boolean => stableKey(scope) === stableKey(dependsOn());

    return { target, parent, entry, inScope, isCurrent };
};

/** Key builders and scope predicates of one resource (what `createResourceKeys` returns). */
export type IResourceKeys = ReturnType<typeof createResourceKeys>;
