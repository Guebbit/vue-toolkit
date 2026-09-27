/**
 * App-wide "is anything of these resources busy?", straight from TanStack's own counters.
 *
 * `useIsFetching`/`useIsMutating` count every in-flight query and mutation on the client; a
 * predicate keeps the ones whose `resourceKey` (first key segment) starts with one of the given
 * prefixes. It sees every resource on the client, whether or not this component watches it.
 *
 * @module composables/isLoading
 * @see docs/composables/is-loading.md
 */
import { computed, type ComputedRef } from 'vue';
import { useIsFetching, useIsMutating, type QueryClient } from '@tanstack/vue-query';
import { matchesAnyPrefix } from '../internal/plainData.js';

/**
 * True while any query or mutation of the matching resources is in flight. A layout-level
 * counterpart to a resource's own `isLoading(key)`: matches `resourceKey` by string prefix
 * (`'account'` matches `'accountProfile'`), the rule `useCoreStore`'s `isLoading` uses too. Call
 * it once in setup: unlike a resource's `isLoading`, this is already a `ComputedRef`.
 *
 * @param prefixes - `resourceKey` prefixes to match; none matches every resource
 * @param queryClient - the client to watch; default the one `VueQueryPlugin` provides
 * @returns whether a matching call is in flight
 */
export const useIsLoading = (
    prefixes: string[] = [],
    queryClient?: QueryClient
): ComputedRef<boolean> => {
    /**
     * True when `resourceKey` starts with one of the prefixes (or there are none).
     *
     * @param resourceKey - first segment of a query or mutation key
     * @returns whether it matches
     */
    const matchesPrefix = (resourceKey: unknown): boolean =>
        matchesAnyPrefix(resourceKey, prefixes);

    /** How many matching queries are fetching. */
    const fetchingCount = useIsFetching(
        { predicate: (query) => matchesPrefix(query.queryKey[0]) },
        queryClient
    );

    /** How many matching mutations are running. */
    const mutatingCount = useIsMutating(
        { predicate: (mutation) => matchesPrefix(mutation.options.mutationKey?.[0]) },
        queryClient
    );

    return computed(() => fetchingCount.value > 0 || mutatingCount.value > 0);
};
