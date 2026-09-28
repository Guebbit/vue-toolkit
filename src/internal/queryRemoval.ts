/**
 * Removing queries without stranding the watchers that observe them.
 *
 * TanStack never tells an observer that its query left the cache: a removed query that a
 * `useQuery` watcher still observes detaches that watcher for good — invalidation and window
 * focus only reach queries still in the cache. So a query something observes is reset in place
 * (data gone, observer kept) instead of removed; only unobserved queries leave the cache.
 *
 * @module internal/queryRemoval
 */
import type { Query, QueryClient, QueryKey } from '@tanstack/vue-query';

/**
 * Drops the queries matching `predicate`: unobserved ones are removed, observed ones are reset
 * to their initial state (and, with `refetch`, fetched again by their active watchers).
 *
 * @param queryClient - the client the queries live on
 * @param predicate - which queries to drop
 * @param refetch - fetch the observed ones again right away (default false)
 */
export const dropQueries = (
    queryClient: QueryClient,
    predicate: (query: Query) => boolean,
    refetch = false
): void => {
    queryClient.removeQueries({
        predicate: (query) => predicate(query) && query.getObserversCount() === 0
    });
    /** The observed queries among the matches. */
    const observed = (query: Query) => predicate(query) && query.getObserversCount() > 0;
    // TanStack: resetQueries resets, then refetches the active (enabled) ones.
    if (refetch) void queryClient.resetQueries({ predicate: observed });
    else {
        const matches = queryClient.getQueryCache().findAll({ predicate: observed });
        for (const query of matches) query.reset();
    }
};

/**
 * Drops the one query under `queryKey`, if cached (see dropQueries).
 *
 * @param queryClient - the client the query lives on
 * @param queryKey - its exact key
 */
export const dropQuery = (queryClient: QueryClient, queryKey: QueryKey): void => {
    const target = queryClient.getQueryCache().find({ queryKey, exact: true });
    if (target) dropQueries(queryClient, (query) => query === target);
};
