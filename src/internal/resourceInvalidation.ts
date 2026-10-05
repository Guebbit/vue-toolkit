/**
 * Marking a resource's cached data stale, by what changed: one record (with every alias pointing
 * at it), or every list of a scope.
 *
 * Both are TanStack `invalidateQueries` over a key predicate: matching entries go stale, and the
 * ones an active watcher observes refetch at once. The returned promise settles once those
 * refetches have.
 *
 * @module internal/resourceInvalidation
 */
import type { QueryClient } from '@tanstack/vue-query';
import { LIST_KINDS, type IResourceKeys } from './resourceKeys.js';

/**
 * The invalidations of one resource.
 *
 * @param queryClient - the client the resource lives on
 * @param keys - the resource's key layout and scope predicates
 * @returns invalidateRecord, invalidateLists
 */
export const createResourceInvalidation = (queryClient: QueryClient, keys: IResourceKeys) => ({
    /**
     * Marks record `id` — and every pointer to it — stale; watched ones refetch.
     *
     * @param id - the record's own (already resolved) id
     * @param scope - the scope snapshot to address
     * @returns settles once the active refetches have
     */
    invalidateRecord: (id: unknown, scope: unknown[]): Promise<void> =>
        queryClient.invalidateQueries({
            predicate: keys.refersTo(id, scope),
            refetchType: 'active' // only a watched copy refetches; an unwatched one waits for its next read
        }),

    /**
     * Marks every list of `scope` stale (all, parent, page, search); watched ones refetch.
     *
     * @param scope - the scope snapshot to address
     * @returns settles once the active refetches have
     */
    invalidateLists: (scope: unknown[]): Promise<void> =>
        queryClient.invalidateQueries({ predicate: keys.inScope(scope, LIST_KINDS) })
});
