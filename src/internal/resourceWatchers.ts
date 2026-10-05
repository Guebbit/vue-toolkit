/**
 * A resource's active reads (`watch*`): each one a TanStack `useQuery` in its own effect scope.
 *
 * The query key is computed, and embeds `dependsOn`, the watched id or the bucket key, so any of
 * them changing switches the query to other data. The key's `meta` travels with each fetch: a
 * fetch reads the id or page its own query was built for, never the watcher's live one, which may
 * have moved on. A watcher never rejects: its handle exposes `error` and the query's state refs,
 * and settle callbacks are derived from the query cache (see `settleCallbacks.ts`).
 *
 * @module internal/resourceWatchers
 * @see docs/composables/structure-rest-api.md
 */
import { computed, effectScope, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue';
import { useQuery, type QueryClient, type QueryKey } from '@tanstack/vue-query';
import type {
    IFetchContext,
    ITanStackQueryOptions,
    IWatchAnySettings,
    IWatchHandle,
    IWatchListSettings,
    IWatchTargetSettings,
    TListCall
} from '../composables/structureRestApi.js';
import type { IListCacheEntry, IResourceKeys, ITargetEntry } from './resourceKeys.js';
import { pickQueryOptions } from './tanstackQueryOptions.js';
import { watchSettled } from './settleCallbacks.js';
import { readContextOf, runningQueryOf, type IRunningQuery } from './runningQuery.js';
import type { createResourceReads } from './resourceReads.js';

/** What an active query is built from. */
export interface IWatchQueryOptions<E> {
    /** The query key, read reactively: a change switches the query to other data. */
    queryKey: () => unknown[];

    /** Extra `meta` for the query, read with the key: what its fetch must use. */
    meta?: () => Record<string, unknown>;

    /** Fetches the entry for the query running now. */
    fetch: (running: IRunningQuery) => Promise<E>;

    /** Whether the query may fetch on its own. Default true. */
    enabled?: MaybeRefOrGetter<boolean>;

    /** Every mount or key switch asks the server. */
    forced?: boolean;

    /** Freshness window (ms); the resource's when omitted. */
    staleTime?: number;

    /** The caller's key, which `isLoading(key)` matches the query by. */
    key?: MaybeRefOrGetter<string[] | undefined>;

    /** TanStack `useQuery` options for this call; the resource's own default when omitted. */
    queryOptions?: ITanStackQueryOptions;
}

/** The parts of a watcher handle every `watch*` reads straight off its query. */
export type TWatchState = Pick<
    IWatchHandle<unknown>,
    'error' | 'isFetching' | 'isPending' | 'dataUpdatedAt'
>;

/** What the watchers need from the resource that owns them. */
export interface IResourceWatchersContext<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- record constraint: unknown rejects interfaces without an index signature
    T extends Record<string | number, any>,
    K extends string | number,
    P extends string | number
> {
    /** The one cache. */
    queryClient: QueryClient;

    /** The resource's key layout. */
    keys: IResourceKeys;

    /** Reads the current scope snapshot. */
    dependsOn: () => unknown[];

    /** The resource's own `queryOptions`, under every watcher's own. */
    resourceQueryOptions: ITanStackQueryOptions;

    /** Whether an entry is cached and fresh within a window. */
    isFresh: (queryKey: QueryKey, custom?: number) => boolean;

    /** The query functions and helpers the reads share. */
    reads: ReturnType<typeof createResourceReads<T, K, P>>;

    /** The record accessors and selection the watchers resolve through. */
    records: {
        /** One record of the current scope, following an alias. */
        getRecord: (id: K) => T | undefined;

        /** Id of the selected record: `watchTarget` selects what it watches. */
        selectedIdentifier: Ref<K | undefined>;
    };
}

/**
 * The watchers of one resource.
 *
 * @param context - see IResourceWatchersContext
 * @returns watchQuery (for the search layer), watchTarget, watchAll, watchByParent, watchAny
 */
export const createResourceWatchers = <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- record constraint: unknown rejects interfaces without an index signature
    T extends Record<string | number, any>,
    K extends string | number,
    P extends string | number
>({
    queryClient,
    keys,
    dependsOn,
    resourceQueryOptions,
    isFresh,
    reads,
    records
}: IResourceWatchersContext<T, K, P>) => {
    /** The shared query functions, by name. */
    const { itemsOf, staleTimeOf, listQueryFunction, targetQueryFunction } = reads;

    /** The record accessors, by name. */
    const { getRecord, selectedIdentifier } = records;

    /**
     * An active query in its own effect scope: re-runs when its key changes (the key embeds
     * `dependsOn`) and when invalidated. Run further watchers in `scope` so `stop` ends them too.
     *
     * @param options - see IWatchQueryOptions
     * @returns the `useQuery` result, its scope, its state refs, `refetch` and `suspense`
     */
    const watchQuery = <E>({
        queryKey,
        meta,
        fetch,
        enabled = true,
        forced,
        staleTime: custom,
        key,
        queryOptions: callQueryOptions
    }: IWatchQueryOptions<E>) => {
        const scope = effectScope();
        const query = scope.run(() =>
            useQuery<E>(
                {
                    // Only the documented caller options (see ITanStackQueryOptions), never an
                    // engine-owned one; a per-call setting overrides the resource's own default.
                    ...pickQueryOptions(resourceQueryOptions),
                    ...pickQueryOptions(callQueryOptions),
                    queryKey: computed(queryKey),
                    queryFn: (context) => fetch(runningQueryOf(context)),
                    enabled: computed(() => toValue(enabled)),
                    staleTime: staleTimeOf({ forced, staleTime: custom }),
                    // Travels with each query: its fetch reads what its own key was built from.
                    meta: computed(() => ({ ...meta?.(), key: toValue(key) }))
                },
                // Explicit: the resource's own client, never a second injection lookup.
                queryClient
            )
        )!;
        /** The handle fields read straight off the query. */
        const state: TWatchState = {
            error: query.error,
            isFetching: query.isFetching,
            isPending: query.isPending,
            dataUpdatedAt: query.dataUpdatedAt
        };
        /** Fetches now; cancelRefetch: false joins a fetch already running instead of restarting it. */
        const refetch = () => query.refetch({ cancelRefetch: false });
        /**
         * TanStack: `suspense()` on a query whose `enabled` is currently false never resolves — it
         * only starts once `enabled` later turns true, which for a disabled watcher (no id yet,
         * `enabled: false`) may be never. Resolve with whatever is cached instead of hanging.
         */
        const suspense = (): Promise<{ data: E | undefined }> =>
            toValue(enabled) ? query.suspense() : Promise.resolve({ data: query.data.value });
        return { query, scope, state, refetch, suspense };
    };

    /**
     * fetchTarget's active counterpart: selects the id and keeps its record fetched, re-running
     * when the id or `dependsOn` changes and when invalidated. A nullish id leaves the selection
     * as it is and fetches nothing.
     *
     * @param apiCall - resolves the record for an id
     * @param idSource - the id, or a Ref/getter producing it
     * @param settings - forced / merge / staleTime, and the settle callbacks
     * @returns the watcher handle
     */
    const watchTarget = (
        apiCall: (id: K, context: IFetchContext) => Promise<T | undefined>,
        idSource: MaybeRefOrGetter<K | undefined | null>,
        { onSuccess, onError, onSettled, ...settings }: IWatchTargetSettings<T, K> = {}
    ): IWatchHandle<T | undefined> => {
        /** The watched id; nullish reads as undefined. */
        const currentId = (): K | undefined => toValue(idSource) ?? undefined;

        /** The record's entry, or a disabled placeholder while there is no id. */
        const queryKey = (): unknown[] => {
            const id = currentId();
            return id === undefined ? keys.idle() : keys.target(id);
        };

        /** The watched record, as cached now. */
        const currentRecord = (): T | undefined => {
            const id = currentId();
            return id === undefined ? undefined : getRecord(id);
        };

        const { scope, state, refetch, suspense } = watchQuery<ITargetEntry<T>>({
            queryKey,
            meta: () => ({ id: currentId() }),
            fetch: (running) => {
                const id = running.meta?.id as K;
                return targetQueryFunction(
                    (context) => apiCall(id, context),
                    id,
                    running,
                    settings.merge
                );
            },
            enabled: () => currentId() !== undefined,
            forced: settings.forced,
            staleTime: settings.staleTime,
            queryOptions: settings.queryOptions
        });

        scope.run(() => {
            // Select eagerly: a record already cached renders at once.
            watch(
                currentId,
                (id) => {
                    if (id !== undefined) selectedIdentifier.value = id;
                },
                { immediate: true }
            );
            watchSettled(
                queryClient,
                {
                    queryKey,
                    isFresh: () => {
                        const id = currentId();
                        return id !== undefined && isFresh(keys.target(id), staleTimeOf(settings));
                    },
                    result: currentRecord,
                    context: () => currentId() as K
                },
                {
                    onSuccess,
                    onSettled,
                    onError: (error, id) => {
                        // A failed refetch only blanks the screen when nothing is left to show: a
                        // record still cached keeps rendering as stale data instead.
                        if (selectedIdentifier.value === id && getRecord(id) === undefined)
                            selectedIdentifier.value = undefined;
                        onError?.(error, id);
                    }
                }
            );
        });

        return {
            ...state,
            data: computed(currentRecord),
            stop: () => scope.stop(),
            refetch: () => {
                const id = currentId();
                return id === undefined ? Promise.resolve(id) : refetch().then(() => getRecord(id));
            },
            suspense: () => {
                const id = currentId();
                return id === undefined
                    ? Promise.resolve(id)
                    : suspense().then(() => getRecord(id));
            }
        };
    };

    /**
     * Active counterpart of a list fetch.
     *
     * @param queryKey - reads the list's key
     * @param meta - reads what its fetch needs besides the key
     * @param apiCall - resolves the list's items for the running query
     * @param settings - forced / merge / partial / staleTime / key / enabled, and the callbacks
     * @param context - what the callbacks receive (the parent id, the bucket key)
     * @returns the watcher handle
     */
    const watchList = <C>(
        queryKey: () => unknown[],
        meta: (() => Record<string, unknown>) | undefined,
        apiCall: (running: IRunningQuery) => Promise<(T | undefined)[]>,
        { onSuccess, onError, onSettled, ...settings }: IWatchListSettings<T, C>,
        context: () => C
    ): IWatchHandle<(T | undefined)[]> => {
        const enabled = settings.enabled ?? true;
        const { query, scope, state, refetch, suspense } = watchQuery<IListCacheEntry<K>>({
            queryKey,
            meta,
            fetch: (running) => listQueryFunction(() => apiCall(running), settings, running),
            enabled,
            forced: settings.forced,
            staleTime: settings.staleTime,
            key: settings.key,
            queryOptions: settings.queryOptions
        });
        /** The listed records, as cached now. */
        const data = computed(() => itemsOf(query.data.value));
        // A cache subscription per watcher: only worth it when a callback listens.
        if (onSuccess || onError || onSettled)
            scope.run(() =>
                watchSettled(
                    queryClient,
                    {
                        queryKey,
                        isFresh: () =>
                            toValue(enabled) &&
                            isFresh(
                                queryKey(),
                                staleTimeOf({
                                    forced: settings.forced,
                                    staleTime: settings.staleTime
                                })
                            ),
                        result: () => data.value,
                        context
                    },
                    { onSuccess, onError, onSettled }
                )
            );
        return {
            ...state,
            data,
            stop: () => scope.stop(),
            refetch: () => refetch().then((result) => itemsOf(result.data)),
            suspense: () => suspense().then((result) => itemsOf(result.data))
        };
    };

    /**
     * fetchAll's active counterpart: re-runs on invalidation and on a `dependsOn` change. Its
     * callbacks receive the bucket key as context.
     *
     * @param apiCall - resolves every item
     * @param settings - forced / merge / partial / staleTime / key / enabled, and the callbacks
     * @returns the watcher handle
     */
    const watchAll = (
        apiCall: TListCall<T>,
        settings: IWatchListSettings<T, string[] | undefined> = {}
    ) =>
        watchList(
            () => keys.entry('all', dependsOn(), [], toValue(settings.key)),
            undefined,
            (running) => apiCall(readContextOf(running)),
            settings,
            () => toValue(settings.key)
        );

    /**
     * fetchByParent's active counterpart: also re-runs when the parent id changes. apiCall
     * receives the parent id the running query is for. A nullish parent id idles instead of
     * calling apiCall — there is nothing to ask for yet, `refetch()` included. Its callbacks
     * receive the parent id as context.
     *
     * @param apiCall - resolves a parent's children
     * @param parentId - the parent id, or a Ref/getter producing it; nullish idles
     * @param settings - forced / merge / partial / staleTime / key / enabled, and the callbacks
     * @returns the watcher handle
     */
    const watchByParent = (
        apiCall: (parentId: P, context: IFetchContext) => Promise<(T | undefined)[]>,
        parentId: MaybeRefOrGetter<P | undefined | null>,
        settings: IWatchListSettings<T, P> = {}
    ): IWatchHandle<(T | undefined)[]> => {
        /** The watched parent id; nullish reads as undefined. */
        const currentParentId = (): P | undefined => toValue(parentId) ?? undefined;
        const handle = watchList(
            () => {
                const parent = currentParentId();
                return parent === undefined
                    ? keys.idle()
                    : keys.parent(parent, dependsOn(), toValue(settings.key));
            },
            () => ({ parentId: currentParentId() }),
            (running) => apiCall(running.meta?.parentId as P, readContextOf(running)),
            {
                ...settings,
                enabled: () => currentParentId() !== undefined && toValue(settings.enabled ?? true)
            },
            () => currentParentId() as P
        );
        return {
            ...handle,
            // TanStack: refetch() runs the query even while `enabled` is false. That is how a
            // caller's own `enabled: false` fetches on demand, but no parent id has nothing to ask.
            refetch: () =>
                currentParentId() === undefined ? Promise.resolve([]) : handle.refetch()
        };
    };

    /**
     * fetchAny's active counterpart. Needs a `key`: an active query must have a stable identity.
     *
     * @param apiCall - resolves the data
     * @param settings - key (required, may be reactive) / forced / staleTime / enabled
     * @returns the watcher handle
     */
    const watchAny = <F = unknown>(
        apiCall: (context: IFetchContext) => Promise<F>,
        settings: IWatchAnySettings
    ): IWatchHandle<F | undefined> => {
        const { query, scope, state, refetch, suspense } = watchQuery<{ data: F }>({
            queryKey: () => keys.entry('any', dependsOn(), [], toValue(settings.key)),
            // Wrapped: TanStack refuses a query function that resolves undefined.
            fetch: (running) => apiCall(readContextOf(running)).then((data) => ({ data })),
            enabled: settings.enabled,
            forced: settings.forced,
            staleTime: settings.staleTime,
            key: settings.key,
            queryOptions: settings.queryOptions
        });
        return {
            ...state,
            data: computed(() => query.data.value?.data),
            stop: () => scope.stop(),
            refetch: () => refetch().then((result) => result.data?.data),
            suspense: () => suspense().then((result) => result.data?.data)
        };
    };

    return { watchQuery, watchTarget, watchAll, watchByParent, watchAny };
};
