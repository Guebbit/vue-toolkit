/**
 * What a resource has in flight, and when its cached data changes, read reactively out of
 * TanStack's caches.
 *
 * TanStack's caches are not Vue-reactive. One subscription per cache bumps counters: a data
 * counter per kind (records, parent lists, searches…) when an entry of that kind gets new data
 * or leaves the cache, and a status counter on every change at all. Whatever reads a counter —
 * the record view reads the `target` one, `isLoading` the status ones — re-evaluates when it
 * moves, and only then. The subscriptions end with the effect scope (component, Pinia store)
 * the resource was built in.
 *
 * @module internal/resourceActivity
 */
import { computed, getCurrentScope, onScopeDispose, readonly, ref, type Ref } from 'vue';
import type { QueryCacheNotifyEvent, QueryClient } from '@tanstack/vue-query';
import { hasKeyPrefix } from './plainData';
import type { TResourceKind } from './resourceKeys';

/**
 * Cache events that touch data or fetch status. The `observer*` events only track `useQuery`
 * mounts and option changes.
 */
const STATUS_EVENTS: ReadonlySet<string> = new Set(['added', 'removed', 'updated']);

/**
 * Query actions that change an entry's data: a fetch or a write landing (`success`), a reset or
 * a revert (`setState`). Fetch starts, failures and invalidations leave the data as it was.
 */
const DATA_ACTIONS: ReadonlySet<string> = new Set(['success', 'setState']);

/** The `meta` every resource call carries: the caller's `key`, which `isLoading(key)` matches. */
interface IActivityMeta {
    /** The caller's key segments, if any. */
    key?: string[];
}

/**
 * Reads the caller's key out of a query's or mutation's `meta`.
 *
 * @param meta - TanStack `meta`, as set by the resource
 * @returns the key, if the call had one
 */
const keyOf = (meta: unknown): string[] | undefined => (meta as IActivityMeta | undefined)?.key;

/**
 * True when a query-cache event changed an entry's data.
 *
 * @param event - the event
 * @returns whether the entry's data changed
 */
const changesData = (event: QueryCacheNotifyEvent): boolean =>
    event.type === 'removed' || (event.type === 'updated' && DATA_ACTIONS.has(event.action.type));

/**
 * Activity of one resource.
 *
 * @param queryClient - the client the resource's queries and mutations live on
 * @param resourceKey - first key segment of everything the resource makes
 * @returns `version(kind)`, `isLoading` and `loading`
 */
export const useResourceActivity = (queryClient: QueryClient, resourceKey: string) => {
    /** Data counters, one per kind, created on first read. */
    const dataVersions = new Map<string, Ref<number>>();

    /**
     * The data counter of one kind.
     *
     * @param kind - the entry kind
     * @returns its counter
     */
    const counterOf = (kind: string): Ref<number> => {
        let counter = dataVersions.get(kind);
        if (!counter) {
            counter = ref(0);
            dataVersions.set(kind, counter);
        }
        return counter;
    };

    /** Bumped on every change of this resource's queries, fetch status included. */
    const queryStatus = ref(0);

    /** Bumped on every status change of this resource's mutations. */
    const mutationStatus = ref(0);

    /** Ends the query-cache subscription. */
    const stopQueries = queryClient.getQueryCache().subscribe((event) => {
        if (!STATUS_EVENTS.has(event.type) || event.query.queryKey[0] !== resourceKey) return;
        queryStatus.value++;
        if (changesData(event)) counterOf(String(event.query.queryKey[1])).value++;
    });

    /** Ends the mutation-cache subscription. */
    const stopMutations = queryClient.getMutationCache().subscribe((event) => {
        if (
            STATUS_EVENTS.has(event.type) &&
            event.mutation?.options.mutationKey?.[0] === resourceKey
        )
            mutationStatus.value++;
    });

    // Built inside an effect scope (component, Pinia store): unsubscribe when it stops. Outside
    // one, the subscriptions live as long as the QueryClient.
    if (getCurrentScope())
        onScopeDispose(() => {
            stopQueries();
            stopMutations();
        });

    /**
     * Moves when an entry of `kind` gets new data or leaves the cache.
     *
     * @param kind - the entry kind
     * @returns the kind's read-only counter
     */
    const version = (kind: TResourceKind): Readonly<Ref<number>> => readonly(counterOf(kind));

    /**
     * True while a query or mutation of this resource runs whose `key` starts with `key`:
     * `['dash']` covers `['dash', 'w1']`. No key: anything of this resource. A plain function —
     * call it inside a `computed` to track it.
     *
     * @param key - key prefix to match
     * @returns whether a matching call is in flight
     */
    const isLoading = (key: string[] = []): boolean => {
        // Read both counters so a computed calling this re-runs on every change.
        void queryStatus.value;
        void mutationStatus.value;
        return (
            queryClient.isFetching({
                predicate: (query) =>
                    query.queryKey[0] === resourceKey && hasKeyPrefix(keyOf(query.meta), key)
            }) > 0 ||
            queryClient.isMutating({
                predicate: (mutation) =>
                    mutation.options.mutationKey?.[0] === resourceKey &&
                    hasKeyPrefix(keyOf(mutation.meta), key)
            }) > 0
        );
    };

    /** True while anything of this resource is in flight: `isLoading()`, as a computed. */
    const loading = computed(() => isLoading());

    return { version, isLoading, loading };
};
