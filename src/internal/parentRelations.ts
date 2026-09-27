/**
 * belongsTo relations as a view over the cache.
 *
 * A parent's children are the ids in its `[resourceKey, 'parent', scope, parentId, ...key]`
 * entries — every bucket `fetchByParent` filled for it — merged in first-seen order. There is no
 * second, separately-tracked copy to keep in sync. Local edits write those entries and mark them
 * stale: adding goes to the plain (keyless) entry, while unlinking and de-duplicating edit every
 * bucket, so the child leaves the merged view. Ids compare as strings, like the cache keys.
 *
 * @module internal/parentRelations
 */
import { computed, type Ref } from 'vue';
import type { Query, QueryClient, QueryKey } from '@tanstack/vue-query';
import type { IListCacheEntry, IResourceKeys } from './resourceKeys';
import { recordListByIds, recordsByIds } from './recordLookup';

/** What the relations need from the resource that owns them. */
export interface IParentRelationsContext<T, K> {
    /** The client the parent lists live on. */
    queryClient: QueryClient;

    /** The resource's key layout and scope predicates. */
    keys: IResourceKeys;

    /** Reads the current scope snapshot. */
    dependsOn: () => unknown[];

    /** Moves when a parent list gets new data or leaves the cache. */
    version: Readonly<Ref<number>>;

    /** Reads one record from the resource's record view. */
    getRecord: (id: K) => T | undefined;
}

/**
 * Ids without repeats, compared as strings, in first-seen order.
 *
 * @param ids - the ids
 * @returns the unique ids
 */
const uniqueIds = <K>(ids: readonly K[]): K[] => {
    const seen = new Set<string>();
    return ids.filter((id) => {
        const key = String(id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

/**
 * Relations of one resource.
 *
 * @param context - see IParentRelationsContext
 * @returns the relation view and its local editors
 */
export const createParentRelations = <T, K extends string | number, P extends string | number>({
    queryClient,
    keys,
    dependsOn,
    version,
    getRecord
}: IParentRelationsContext<T, K>) => {
    /**
     * The ids a list entry holds.
     *
     * @param query - a parent list query
     * @returns its ids, empty when it holds none
     */
    const idsOf = (query: Query): K[] =>
        (query.state.data as IListCacheEntry<K> | undefined)?.ids ?? [];

    /**
     * Every cached bucket of one parent under the current scope.
     *
     * @param parentId - the parent id
     * @returns the parent's list queries
     */
    const bucketsOf = (parentId: P): Query[] => {
        const current = keys.inScope(dependsOn(), ['parent']);
        return queryClient.getQueryCache().findAll({
            predicate: (query) => current(query) && query.queryKey[3] === String(parentId)
        });
    };

    /**
     * Stores a parent list's ids as a local edit.
     *
     * @param queryKey - the list entry's key
     * @param ids - the new child ids
     */
    const writeIds = (queryKey: QueryKey, ids: K[]): void => {
        // updatedAt 0 = stale: a local edit is a guess, the next fetchByParent asks the server.
        queryClient.setQueryData<IListCacheEntry<K>>(queryKey, { ids }, { updatedAt: 0 });
    };

    /** Every parent's child ids under the current scope: the union of its buckets. */
    const parentHasMany = computed<Record<P, K[]>>(() => {
        void version.value;
        const result = {} as Record<P, K[]>;
        const current = keys.inScope(dependsOn(), ['parent']);
        for (const query of queryClient.getQueryCache().findAll({ predicate: current })) {
            const parentId = query.queryKey[3] as P;
            result[parentId] = uniqueIds([...(result[parentId] ?? []), ...idsOf(query)]);
        }
        return result;
    });

    /**
     * A parent's child ids.
     *
     * @param parentId - the parent id
     * @returns the ids, empty when none are cached
     */
    const childIds = (parentId: P): K[] => parentHasMany.value[String(parentId) as P] ?? [];

    /**
     * Links a child to a parent, once: into the parent's plain (keyless) entry.
     *
     * @param parentId - the parent id
     * @param childId - the child record id
     */
    const addToParent = (parentId: P, childId: K): void => {
        if (childIds(parentId).some((id) => String(id) === String(childId))) return;
        const plainKey = keys.parent(parentId);
        const ids = queryClient.getQueryData<IListCacheEntry<K>>(plainKey)?.ids ?? [];
        writeIds(plainKey, [...ids, childId]);
    };

    /**
     * Unlinks a child from a parent, in every bucket.
     *
     * @param parentId - the parent id
     * @param childId - the child record id
     */
    const removeFromParent = (parentId: P, childId: K): void => {
        for (const query of bucketsOf(parentId))
            writeIds(
                query.queryKey,
                idsOf(query).filter((id) => String(id) !== String(childId))
            );
    };

    /**
     * Drops repeated child ids of a parent, in every bucket.
     *
     * @param parentId - the parent id
     */
    const removeDuplicateChildren = (parentId: P): void => {
        for (const query of bucketsOf(parentId)) writeIds(query.queryKey, uniqueIds(idsOf(query)));
    };

    /**
     * A parent's children, by id. Ids whose record is not cached are skipped.
     *
     * @param parentId - the parent id
     * @returns the child records, by id
     */
    const getRecordsByParent = (parentId?: P): Record<K, T> =>
        parentId === undefined ? ({} as Record<K, T>) : recordsByIds(childIds(parentId), getRecord);

    /**
     * A parent's children, as a list in the relation's order. Ids whose record is not cached are
     * skipped.
     *
     * @param parentId - the parent id
     * @returns the child records
     */
    const getListByParent = (parentId?: P): T[] =>
        parentId === undefined ? [] : recordListByIds(childIds(parentId), getRecord);

    return {
        parentHasMany,
        addToParent,
        removeFromParent,
        removeDuplicateChildren,
        getRecordsByParent,
        getListByParent
    };
};
