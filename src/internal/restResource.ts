/**
 * The implementation behind `useStructureRestApi`.
 *
 * Built in layers: the key layout (`resourceKeys`), what is in flight (`resourceActivity`), the
 * records (`queryRecordStore`, under `useStructureDataManagement`) and their relations
 * (`parentRelations`). On top sit three kinds of operation over the same `QueryClient`: one-shot
 * reads (`fetchQuery`), active reads (`useQuery`) and mutations (`resourceMutations`).
 *
 * Every write of an answer checks the `dependsOn` snapshot its call started under, and that its
 * query was not cancelled: an answer that arrives after the scope moved on (logout, language
 * switch) or after an update/delete cancelled its read is dropped. An active query fetches what
 * its own key and `meta` say, never the watcher's live id or page, which may have moved on.
 *
 * Returns the public `api`, and the `engine` `useStructureSearchApi` builds its `'search'` kind
 * on. The engine never reaches application code.
 *
 * @module internal/restResource
 * @see docs/composables/structure-rest-api.md
 */
import {
    computed,
    effectScope,
    getCurrentScope,
    markRaw,
    onScopeDispose,
    toValue,
    watch,
    type MaybeRefOrGetter,
    type WatchSource
} from 'vue';
import {
    CancelledError,
    useQuery,
    useQueryClient,
    type QueryClient,
    type QueryKey
} from '@tanstack/vue-query';
import { getUuid } from '@guebbit/js-toolkit';
import { useStructureDataManagement } from '../composables/structureDataManagement.js';
import type {
    IFetchContext,
    IFetchSettings,
    IStructureRestApi,
    IWatchAnySettings,
    IWatchHandle,
    IWatchListSettings,
    IWatchTargetSettings
} from '../composables/structureRestApi.js';
import { isNil, stableKey } from './plainData.js';
import { createResourceKeys, type IListCacheEntry, type ITargetEntry } from './resourceKeys.js';
import { useResourceActivity } from './resourceActivity.js';
import { createQueryRecordStore } from './queryRecordStore.js';
import { createParentRelations } from './parentRelations.js';
import { watchSettled } from './settleCallbacks.js';
import { createFreshnessChecks } from './freshnessChecks.js';
import { createResourceMutations } from './resourceMutations.js';
import { dropQueries, dropQuery } from './queryRemoval.js';
import { createWriteGuard } from './writeGuard.js';
import { scopeRegistryFor } from './scopeRegistry.js';

/** A list call: resolves the list's items. */
export type TListCall<T> = (context: IFetchContext) => Promise<(T | undefined)[]>;

/** fetchMultiple's apiCall: resolves the ids it was asked to fetch, missing or stale ones only. */
export type TMultipleCall<T, K> = (ids: K[], context: IFetchContext) => Promise<(T | undefined)[]>;

/** Extra data a list entry stores next to its ids, computed once the ids are known. */
export type TListExtra<K> = (ids: K[]) => Record<string, unknown>;

/** The query a query function is running for. */
export interface IRunningQuery {
    /** Its key. */
    queryKey: QueryKey;

    /** Its `meta`: what the watcher that built it knew (the raw id, the applied filters). */
    meta: Record<string, unknown> | undefined;

    /** True once TanStack cancelled it: its answer must not be stored. */
    isCancelled: () => boolean;

    /** Aborted by TanStack on cancel. Read lazily — see runningQueryOf. */
    readonly signal: AbortSignal;
}

/**
 * The running query of a TanStack query-function context. The abort signal is read lazily:
 * reading it up front would change how TanStack cancels a fetch whose watcher unmounts.
 *
 * @param context - the context TanStack passes a query function
 * @param context.queryKey - the running query's key
 * @param context.meta - the running query's meta
 * @param context.signal - aborted by TanStack on cancel
 * @returns the running query
 */
const runningQueryOf = (context: {
    queryKey: QueryKey;
    meta: Record<string, unknown> | undefined;
    signal: AbortSignal;
}): IRunningQuery => ({
    queryKey: context.queryKey,
    meta: context.meta,
    isCancelled: () => context.signal.aborted,
    get signal() {
        return context.signal;
    }
});

/**
 * The `{ signal }` context a read `apiCall` receives (see IFetchContext), built from anything
 * exposing a lazy `signal` — a running query, or TanStack's own query-function context. Its own
 * `signal` stays a getter, so an `apiCall` that never reads it never forces TanStack's abort
 * wiring on its own.
 *
 * @param source - a running query, or TanStack's raw query-function context
 * @returns the context to hand the caller's `apiCall`
 */
const readContextOf = (source: { signal: AbortSignal }): IFetchContext => ({
    get signal() {
        return source.signal;
    }
});

/**
 * The answer of a cancelled throwaway read: it has no cache entry to fall back on.
 *
 * @returns nothing
 */
const nothing = (): undefined => {
    // no cached answer to return
};

/** resourceKeys already warned about being built outside an effect scope (see createRestResource). */
const warnedNoScope = new Set<string>();

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
}

/**
 * Builds a resource: its public API and the engine the search layer shares.
 *
 * @param options - see IStructureRestApi
 * @returns `api` (public) and `engine` (internal)
 */
export const createRestResource = <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string | number, any> = Record<string, any>,
    K extends string | number = Extract<keyof T, string | number>,
    P extends string | number = string | number
>({
    identifiers = 'id',
    resourceKey,
    staleTime = 3_600_000, // 1 hour
    dependsOn = () => [],
    maxRecords = 10_000,
    delimiter = '|',
    queryClient: queryClientOption
}: IStructureRestApi) => {
    // Every cache subscription this resource makes (resourceActivity, the scope registry claim
    // below) is torn down through onScopeDispose — with no effect scope active, there is nothing
    // to call it, and no other way to stop them: they leak for the QueryClient's whole lifetime,
    // silently. Warned once per resourceKey rather than every call, so a factory invoked in a loop
    // doesn't flood the console.
    if (!getCurrentScope() && !warnedNoScope.has(resourceKey)) {
        warnedNoScope.add(resourceKey);
        // eslint-disable-next-line no-console -- a silent, permanent subscription leak is worth seeing
        console.warn(
            `useStructureRestApi('${resourceKey}'): built outside an effect scope (a component's ` +
                'setup, a Pinia setup store, or effectScope()). Its cache subscriptions have nothing ' +
                "to stop them and will leak for the QueryClient's lifetime."
        );
    }

    /**
     * The one cache. `markRaw`: Pinia wraps a setup store's return in `reactive()`, and calling a
     * `QueryClient` method (native `#private` fields) through that proxy throws.
     */
    const queryClient: QueryClient = markRaw(queryClientOption ?? useQueryClient());

    /** Key layout and scope predicates. */
    const keys = createResourceKeys(resourceKey, dependsOn);

    /** What this resource has in flight, and when its data changes. */
    const activity = useResourceActivity(queryClient, resourceKey);

    // TanStack defaults, by key prefix (every scope at once). gcTime Infinity: records and
    // parent relations stay cached while nothing watches them — stale data still renders.
    queryClient.setQueryDefaults([resourceKey, 'target'], { gcTime: Number.POSITIVE_INFINITY });
    queryClient.setQueryDefaults([resourceKey, 'parent'], { gcTime: Number.POSITIVE_INFINITY });

    // Live-scope claims for this (queryClient, resourceKey): lets a second instance under a
    // different scope (two screens side by side) coexist with this one instead of either wiping
    // the other's data out from under it (see ./scopeRegistry).
    const scopeRegistry = scopeRegistryFor(queryClient, resourceKey);

    // Claimed before the sweep below, so this instance's own scope is never read as abandoned.
    let releaseScope = scopeRegistry.claim(dependsOn());
    if (getCurrentScope()) onScopeDispose(() => releaseScope());

    // Anything of this resource cached under a scope nothing claims any more belongs to a user or
    // language that is no longer current (it changed while no instance was alive to clean up):
    // drop it. A scope another live instance still claims is left alone.
    dropQueries(
        queryClient,
        (query) =>
            query.queryKey[0] === resourceKey &&
            !scopeRegistry.isLive(query.queryKey[2] as unknown[])
    );

    /** The records, stored as TanStack queries. */
    const store = createQueryRecordStore<T, K>({
        queryClient,
        keys,
        dependsOn,
        version: activity.version('target')
    });

    /** Records, selection and client-side pagination, written through the store. */
    const records = useStructureDataManagement<T, K, P>(identifiers, delimiter, store);

    /** Record accessors and state, built on by the operations below and passed through. */
    const {
        createIdentifier,
        identifier: identifierKey,
        itemDictionary,
        itemList,
        setRecords,
        resetRecords,
        getRecord,
        getRecords,
        addRecord,
        addRecords,
        editRecord,
        editRecords,
        deleteRecord,
        selectedIdentifier,
        selectedRecord,
        lastInsertedIdentifier,
        lastInsertedIdentifiers,
        lastInsertedRecord,
        pageCurrent,
        pageSize,
        pageTotal,
        pageOffset,
        pageItemList
    } = records;

    /** "Would this call be served from cache?", plus the freshness test the reads share. */
    const { isFresh, classifyMultiple, ...freshnessChecks } = createFreshnessChecks<K, P>({
        queryClient,
        keys,
        dependsOn,
        staleTime
    });

    /** Read/mutation write ordering for this resource's records (see the module header). */
    const writeGuard = createWriteGuard<K>();

    /** belongsTo relations, read from the same cache as the records. */
    const relations = createParentRelations<T, K, P>({
        queryClient,
        keys,
        dependsOn,
        version: activity.version('parent'),
        getRecord
    });

    // ------------------------------------------ storing ------------------------------------------

    /**
     * Stores one fetched item. `partial`: merge and keep the record's freshness. `merge`: merge.
     * Otherwise the item replaces the record. With `readAt`, the write is a read's: skipped once
     * the write guard says a mutation on `id` owns it now (see the module header).
     *
     * @param item - the fetched item
     * @param id - its id
     * @param settings - merge / partial
     * @param readAt - the clock value the read captured when it began; omitted for a mutation's
     *                 own write, which is never guarded (see `IResourceMutationsContext.storeItem`)
     */
    const storeItem = (
        item: T,
        id: K,
        { merge = false, partial = false }: Pick<IFetchSettings, 'merge' | 'partial'> = {},
        readAt?: number
    ): void => {
        if (readAt !== undefined && !writeGuard.canWrite(id, readAt)) return;
        if (partial) editRecord(item, id, true);
        else if (merge) store.asFetched(() => editRecord(item, id, true));
        else store.asFetched(() => addRecord(item));
    };

    /** Optimistic writes and free-form commands. */
    const mutations = createResourceMutations<T, K>({
        queryClient,
        resourceKey,
        keys,
        dependsOn,
        records: { createIdentifier, getRecord, addRecord, editRecord, deleteRecord },
        store,
        storeItem,
        writeGuard
    });

    /**
     * Stores a batch of fetched items.
     *
     * @param items - the fetched items; empty slots are skipped
     * @param settings - merge / partial
     * @param readAt - the clock value the read captured when it began
     * @returns the stored ids, in order
     */
    const storeItems = (
        items: (T | undefined)[],
        settings: Pick<IFetchSettings, 'merge' | 'partial'>,
        readAt: number
    ): K[] =>
        items
            .filter((item): item is T => !isNil(item))
            .map((item) => {
                const id = createIdentifier(item);
                storeItem(item, id, settings, readAt);
                return id;
            });

    /**
     * Past `maxRecords`, removes every query of the current scope except `keep` (the call writing
     * right now), the ones still fetching (their answers are on the way), and the ones something is
     * actively watching (they're on screen — a wipe would empty a detail view with nothing to
     * refetch it). Those still count toward the bound; they're just never the ones evicted.
     *
     * @param incoming - how many records not cached yet are about to be written
     * @param keep - key of the query writing them
     */
    const enforceMaxRecords = (incoming: number, keep: QueryKey): void => {
        if (maxRecords <= 0) return;
        const inCurrent = keys.inScope(dependsOn());
        const cached = queryClient
            .getQueryCache()
            .findAll({ predicate: inCurrent })
            .filter(
                (query) =>
                    query.queryKey[1] === 'target' &&
                    // An alias entry (see targetQueryFunction) holds no record of its own: it
                    // never counts as one of the bound's cached records.
                    (query.state.data as ITargetEntry<T> | undefined)?.data !== undefined
            );
        if (cached.length + incoming <= maxRecords) return;
        const kept = queryClient.getQueryCache().find({ queryKey: keep, exact: true });
        dropQueries(
            queryClient,
            (query) =>
                inCurrent(query) &&
                query !== kept &&
                query.state.fetchStatus !== 'fetching' &&
                query.getObserversCount() === 0
        );
    };

    /**
     * Stores a fetched batch under the scope it was asked in. A late answer (scope moved on, or
     * the query was cancelled) stores nothing.
     *
     * @param items - the fetched items
     * @param scopeAtStart - the `dependsOn` snapshot the call started under
     * @param running - the query writing them (kept through a `maxRecords` wipe)
     * @param settings - merge / partial
     * @param readAt - the clock value the read captured when it began
     * @returns the stored ids, in order
     */
    const storeBatch = (
        items: (T | undefined)[] = [],
        scopeAtStart: unknown[],
        running: IRunningQuery,
        settings: Pick<IFetchSettings, 'merge' | 'partial'>,
        readAt: number
    ): K[] => {
        if (running.isCancelled() || !keys.isCurrent(scopeAtStart)) return [];
        // Only records not cached yet grow the cache: a refetch of the same list adds nothing.
        const added = items.filter(
            (item) =>
                !isNil(item) &&
                isNil(
                    queryClient.getQueryData<ITargetEntry<T>>(keys.target(createIdentifier(item)))
                        ?.data
                )
        );
        enforceMaxRecords(added.length, running.queryKey);
        return storeItems(items, settings, readAt);
    };

    /**
     * Removes a query that failed before ever holding data: it is only an error marker. One that
     * holds data keeps serving it — stale data still renders.
     *
     * @param queryKey - the failed query's key
     */
    const dropIfEmpty = (queryKey: QueryKey): void => {
        if (queryClient.getQueryData(queryKey) === undefined) dropQuery(queryClient, queryKey);
    };

    /**
     * Items of a list entry, read through the record view.
     *
     * @param entry - the cached list entry
     * @returns the items, `undefined` for ids no longer cached
     */
    const itemsOf = (entry: IListCacheEntry<K> | undefined): (T | undefined)[] =>
        (entry?.ids ?? []).map((id) => getRecord(id));

    /**
     * Staleness window of a call.
     *
     * @param settings - forced / staleTime
     * @returns 0 when forced, else the call's or the resource's window
     */
    const staleTimeOf = ({ forced = false, staleTime: custom }: IFetchSettings = {}): number =>
        forced ? 0 : (custom ?? staleTime);

    /**
     * Settles a one-shot read. A cancellation (`dependsOn` changed, or an update or delete of the
     * same data started) resolves with what is cached instead of failing; a real failure drops
     * the empty entry it may have left, then rethrows.
     *
     * @param read - the read
     * @param answer - maps its resolved value to the caller's result
     * @param cached - the caller's result from the cache, for a cancelled read
     * @param queryKey - the read's key, when it has a cache entry
     * @returns the caller's result
     */
    const settleRead = <D, R>(
        read: Promise<D>,
        answer: (data: D) => R,
        cached: () => R,
        queryKey?: QueryKey
    ): Promise<R> =>
        read.then(answer, (error: unknown) => {
            if (error instanceof CancelledError) return cached();
            if (queryKey) dropIfEmpty(queryKey);
            throw error;
        });

    /**
     * Runs a read as a throwaway query (unique key, `gcTime: 0`): no entry to serve later, but
     * `isLoading` sees it while it runs.
     *
     * @param scope - the scope the read runs under
     * @param read - the read
     * @returns what the read resolves
     */
    const runThrowaway = <D>(
        scope: unknown[],
        read: (running: IRunningQuery) => Promise<D>
    ): Promise<D> =>
        queryClient.fetchQuery<D>({
            queryKey: keys.entry('any', scope, [getUuid()]),
            queryFn: (context) => read(runningQueryOf(context)),
            gcTime: 0 // throwaway: dropped as soon as the read settles
        });

    // ----------------------------------------- queries -------------------------------------------

    /**
     * The query function of every list query: fetch, store each item, resolve the ids (plus
     * `extra`).
     *
     * @param apiCall - resolves the list's items
     * @param settings - merge / partial
     * @param running - the query it runs for
     * @param extra - data stored next to the ids
     * @returns the list entry
     */
    const listQueryFunction = (
        apiCall: TListCall<T>,
        settings: Pick<IFetchSettings, 'merge' | 'partial'>,
        running: IRunningQuery,
        extra?: TListExtra<K>
    ): Promise<IListCacheEntry<K>> => {
        const scopeAtStart = dependsOn();
        const readAt = writeGuard.readClock();
        return apiCall(readContextOf(running)).then((items) => {
            const ids = storeBatch(items, scopeAtStart, running, settings, readAt);
            return { ids, ...extra?.(ids) };
        });
    };

    /**
     * The query function of a record's own entry: fetch, store, and resolve with the entry the
     * store now holds. TanStack writes the resolved value back under the same key, so resolving
     * with the raw answer would undo a merge.
     *
     * @param apiCall - resolves the record
     * @param id - the record id
     * @param running - the query it runs for
     * @param merge - merge into the stored record
     * @returns the record's entry
     */
    const targetQueryFunction = (
        apiCall: (context: IFetchContext) => Promise<T | undefined>,
        id: K,
        running: IRunningQuery,
        merge = false
    ): Promise<ITargetEntry<T>> => {
        const scopeAtStart = dependsOn();
        const readAt = writeGuard.readClock();
        return apiCall(readContextOf(running)).then((item) => {
            // Cancelled (an update or delete of this record started) or late: store nothing.
            if (isNil(item) || running.isCancelled() || !keys.isCurrent(scopeAtStart))
                return { data: item };
            // The record always lives under its own id, whatever id this query was fetched by
            // (`fetchTarget(apiCall, 'my-slug')` resolving `{ id: 7 }`): storing it a second time
            // under the requested id would leave two independent, divergent copies in the cache.
            const realId = createIdentifier(item);
            const targetKey = keys.target(realId);
            // Single-record fetches never went through enforceMaxRecords (only list-shaped ones
            // did): browsing many detail pages one at a time, each cached with gcTime: Infinity,
            // grew the cache without bound. Only a genuinely new id counts — a refetch of one
            // already cached doesn't grow the total.
            if (queryClient.getQueryData<ITargetEntry<T>>(targetKey)?.data === undefined)
                enforceMaxRecords(1, targetKey);
            storeItem(item, realId, { merge }, readAt);
            if (realId === id)
                return queryClient.getQueryData<ITargetEntry<T>>(keys.target(id)) ?? { data: item };
            // Fetched by an alternate key: this entry is an alias, not a second copy. getRecord and
            // selectedRecord follow it one hop (see queryRecordStore.ts's `resolve`).
            return { aliasOf: realId };
        });
    };

    /**
     * One-shot list read through the cache (see settleRead for cancellation and failure).
     *
     * @param queryKey - the list's key
     * @param apiCall - resolves the list's items
     * @param settings - forced / merge / partial / staleTime / key
     * @param extra - data stored next to the ids
     * @returns the listed items
     */
    const runListQuery = (
        queryKey: unknown[],
        apiCall: TListCall<T>,
        settings: IFetchSettings = {},
        extra?: TListExtra<K>
    ): Promise<(T | undefined)[]> =>
        settleRead(
            queryClient.fetchQuery<IListCacheEntry<K>>({
                queryKey,
                queryFn: (context) =>
                    listQueryFunction(apiCall, settings, runningQueryOf(context), extra),
                staleTime: staleTimeOf(settings),
                meta: { key: settings.key } // what isLoading(key) matches
            }),
            itemsOf,
            () => itemsOf(queryClient.getQueryData(queryKey)),
            queryKey
        );

    /**
     * An active query in its own effect scope: re-runs when its key changes (the key embeds
     * `dependsOn`) and when invalidated. Run further watchers in `scope` so `stop` ends them too.
     *
     * @param options - see IWatchQueryOptions
     * @returns the `useQuery` result, its scope, and `refetch`
     */
    const watchQuery = <E>({
        queryKey,
        meta,
        fetch,
        enabled = true,
        forced,
        staleTime: custom,
        key
    }: IWatchQueryOptions<E>) => {
        const scope = effectScope();
        const query = scope.run(() =>
            useQuery<E>(
                {
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
        /** Fetches now; cancelRefetch: false joins a fetch already running instead of restarting it. */
        const refetch = () => query.refetch({ cancelRefetch: false });
        return { query, scope, refetch };
    };

    /**
     * Get every item from the server. Cached under `[resourceKey, 'all', dependsOn, ...key]`.
     *
     * @param apiCall - resolves every item
     * @param settings - forced / merge / partial / staleTime / key
     * @returns the items
     */
    const fetchAll = (apiCall: TListCall<T>, settings: IFetchSettings = {}) =>
        runListQuery(keys.entry('all', dependsOn(), [], settings.key), apiCall, settings);

    /**
     * Same as fetchAll, for the children of one parent. Cached under
     * `[resourceKey, 'parent', dependsOn, parentId, ...key]` — an entry `parentHasMany` reads.
     *
     * @param apiCall - resolves the parent's children
     * @param parentId - the parent id (with multiple identifiers, build it with createIdentifier)
     * @param settings - forced / merge / partial / staleTime / key
     * @returns the children
     */
    const fetchByParent = (apiCall: TListCall<T>, parentId: P, settings: IFetchSettings = {}) =>
        runListQuery(keys.parent(parentId, dependsOn(), settings.key), apiCall, settings);

    /**
     * One server-paginated page, unfiltered. Cached under
     * `[resourceKey, 'page', dependsOn, pageSize, page, ...key]`.
     *
     * @param apiCall - resolves the page's items
     * @param page - page number, from 1
     * @param pageSize - page size, part of the cache key
     * @param settings - forced / merge / partial / staleTime / key
     * @returns the page's items
     */
    const fetchPaginate = (
        apiCall: TListCall<T>,
        page = 1,
        pageSize = 10,
        settings: IFetchSettings = {}
    ) =>
        runListQuery(
            keys.entry('page', dependsOn(), [pageSize, page], settings.key),
            apiCall,
            settings
        );

    /**
     * Get one record from the server. Cached under `[resourceKey, 'target', dependsOn, id]`: a
     * record has exactly one entry. Without an id there is no entry to read through, so it always
     * asks the server (as a throwaway query).
     *
     * @param apiCall - resolves the record
     * @param id - the record id (with multiple identifiers, build it with createIdentifier)
     * @param settings - forced / merge / staleTime
     * @returns the stored record
     */
    const fetchTarget = (
        apiCall: (context: IFetchContext) => Promise<T | undefined>,
        id?: K,
        settings: Pick<IFetchSettings, 'forced' | 'merge' | 'staleTime'> = {}
    ): Promise<T | undefined> => {
        if (id === undefined) {
            const scopeAtStart = dependsOn();
            const readAt = writeGuard.readClock();
            return settleRead(
                // Wrapped: TanStack refuses a query function that resolves undefined.
                runThrowaway(scopeAtStart, (running) =>
                    apiCall(readContextOf(running)).then((item) => ({ data: item }))
                ),
                ({ data: item }): T | undefined => {
                    if (isNil(item) || !keys.isCurrent(scopeAtStart)) return item;
                    const itemId = createIdentifier(item);
                    storeItem(item, itemId, { merge: settings.merge }, readAt);
                    return getRecord(itemId);
                },
                nothing
            );
        }
        const queryKey = keys.target(id);
        return settleRead(
            queryClient.fetchQuery<ITargetEntry<T>>({
                queryKey,
                queryFn: (context) =>
                    targetQueryFunction(apiCall, id, runningQueryOf(context), settings.merge),
                staleTime: staleTimeOf(settings)
            }),
            () => getRecord(id),
            () => getRecord(id),
            queryKey
        );
    };

    /**
     * fetchTarget's active counterpart: selects the id and keeps its record fetched, re-running
     * when the id or `dependsOn` changes and when invalidated. A nullish id leaves the selection
     * as it is and fetches nothing.
     *
     * @param idSource - Ref, ComputedRef or getter producing the id
     * @param apiCall - resolves the record for an id
     * @param settings - forced / merge / staleTime, and the settle callbacks
     * @returns the watcher handle
     */
    const watchTarget = (
        idSource: WatchSource<K | undefined | null>,
        apiCall: (id: K, context: IFetchContext) => Promise<T | undefined>,
        { onSuccess, onError, onSettled, ...settings }: IWatchTargetSettings<T, K> = {}
    ): IWatchHandle<T | undefined> => {
        /** The watched id; nullish reads as undefined. */
        const currentId = (): K | undefined => toValue(idSource) ?? undefined;

        /** The record's entry, or a disabled placeholder while there is no id. */
        const queryKey = (): unknown[] => {
            const id = currentId();
            return id === undefined ? keys.entry('any', dependsOn(), ['idle']) : keys.target(id);
        };

        const { query, scope, refetch } = watchQuery<ITargetEntry<T>>({
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
            staleTime: settings.staleTime
        });

        scope.run(() => {
            // Select eagerly: a record already cached renders at once.
            watch(
                idSource,
                (id) => {
                    if (id !== undefined && id !== null) selectedIdentifier.value = id;
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
                    result: () => getRecord(currentId() as K),
                    context: () => currentId() as K
                },
                {
                    onSuccess,
                    onSettled,
                    onError: (error, id) => {
                        // A background refetch's failure only blanks the screen when there is
                        // nothing left to show: a record still cached from before (or from another
                        // watcher of the same id) keeps rendering as stale data instead.
                        if (selectedIdentifier.value === id && getRecord(id) === undefined)
                            selectedIdentifier.value = undefined;
                        onError?.(error, id);
                    }
                }
            );
        });

        return {
            stop: () => scope.stop(),
            refetch: () => {
                const id = currentId();
                if (id === undefined) return Promise.resolve(id);
                return refetch().then(() => getRecord(id));
            },
            error: query.error
        };
    };

    /**
     * Active counterpart of a list fetch.
     *
     * @param queryKey - reads the list's key
     * @param meta - reads what its fetch needs besides the key
     * @param apiCall - resolves the list's items for the running query
     * @param settings - forced / merge / partial / staleTime / key
     * @returns the watcher handle
     */
    const watchList = (
        queryKey: () => unknown[],
        meta: (() => Record<string, unknown>) | undefined,
        apiCall: (running: IRunningQuery) => Promise<(T | undefined)[]>,
        settings: IWatchListSettings = {}
    ): IWatchHandle<(T | undefined)[]> => {
        const { query, scope, refetch } = watchQuery<IListCacheEntry<K>>({
            queryKey,
            meta,
            fetch: (running) => listQueryFunction(() => apiCall(running), settings, running),
            enabled: settings.enabled,
            forced: settings.forced,
            staleTime: settings.staleTime,
            key: settings.key
        });
        return {
            stop: () => scope.stop(),
            refetch: () => refetch().then((result) => itemsOf(result.data)),
            error: query.error
        };
    };

    /**
     * fetchAll's active counterpart: re-runs on invalidation and on a `dependsOn` change.
     *
     * @param apiCall - resolves every item
     * @param settings - forced / merge / partial / staleTime / key / enabled
     * @returns the watcher handle
     */
    const watchAll = (apiCall: TListCall<T>, settings: IWatchListSettings = {}) =>
        watchList(
            () => keys.entry('all', dependsOn(), [], toValue(settings.key)),
            undefined,
            (running) => apiCall(readContextOf(running)),
            settings
        );

    /**
     * fetchByParent's active counterpart: also re-runs when the parent id changes. apiCall
     * receives the parent id the running query is for. A nullish parent id idles instead of
     * calling apiCall — there is nothing to ask for yet.
     *
     * @param apiCall - resolves a parent's children
     * @param parentId - the parent id, or a Ref/getter producing it; nullish idles
     * @param settings - forced / merge / partial / staleTime / key / enabled
     * @returns the watcher handle
     */
    const watchByParent = (
        apiCall: (parentId: P, context: IFetchContext) => Promise<(T | undefined)[]>,
        parentId: MaybeRefOrGetter<P | undefined | null>,
        settings: IWatchListSettings = {}
    ) => {
        /** The watched parent id; nullish reads as undefined. */
        const currentParentId = (): P | undefined => toValue(parentId) ?? undefined;
        return watchList(
            () => {
                const parent = currentParentId();
                return parent === undefined
                    ? keys.entry('any', dependsOn(), ['idle'])
                    : keys.parent(parent, dependsOn(), toValue(settings.key));
            },
            () => ({ parentId: currentParentId() }),
            (running) => apiCall(running.meta?.parentId as P, readContextOf(running)),
            {
                ...settings,
                enabled: () => currentParentId() !== undefined && toValue(settings.enabled ?? true)
            }
        );
    };

    /**
     * Generic read for anything that is not a record. With `key`: cached under
     * `[resourceKey, 'any', dependsOn, ...key]`. Without: always asks the server, as a throwaway
     * query.
     *
     * @param apiCall - resolves the data
     * @param settings - forced / staleTime / key
     * @returns the data
     */
    const fetchAny = <F = unknown>(
        apiCall: (context: IFetchContext) => Promise<F>,
        settings: Pick<IFetchSettings, 'forced' | 'staleTime' | 'key'> = {}
    ): Promise<F | undefined> => {
        // Wrapped: TanStack refuses a query function that resolves undefined. Accepts either a
        // running query or TanStack's own raw context — both expose a lazy `signal`.
        const wrapped = (source: { signal: AbortSignal }) =>
            apiCall(readContextOf(source)).then((data) => ({ data }));
        if (!settings.key)
            return settleRead(
                runThrowaway(dependsOn(), wrapped),
                ({ data }): F | undefined => data,
                nothing
            );
        const queryKey = keys.entry('any', dependsOn(), [], settings.key);
        return settleRead(
            queryClient.fetchQuery<{ data: F }>({
                queryKey,
                queryFn: wrapped,
                staleTime: staleTimeOf(settings),
                meta: { key: settings.key } // what isLoading(key) matches
            }),
            ({ data }): F | undefined => data,
            () => queryClient.getQueryData<{ data: F }>(queryKey)?.data,
            queryKey
        );
    };

    /**
     * fetchAny's active counterpart. Needs a `key`: an active query must have a stable identity.
     * Also returns `data`, since the answer is not a record.
     *
     * @param apiCall - resolves the data
     * @param settings - key (required, may be reactive) / forced / staleTime / enabled
     * @returns the watcher handle, plus `data`
     */
    const watchAny = <F = unknown>(
        apiCall: (context: IFetchContext) => Promise<F>,
        settings: IWatchAnySettings
    ) => {
        const { query, scope, refetch } = watchQuery<{ data: F }>({
            queryKey: () => keys.entry('any', dependsOn(), [], toValue(settings.key)),
            // Wrapped: TanStack refuses a query function that resolves undefined.
            fetch: (running) => apiCall(readContextOf(running)).then((data) => ({ data })),
            enabled: settings.enabled,
            forced: settings.forced,
            staleTime: settings.staleTime,
            key: settings.key
        });
        const handle: IWatchHandle<F | undefined> = {
            stop: () => scope.stop(),
            refetch: () => refetch().then((result) => result.data?.data),
            error: query.error
        };
        return { ...handle, data: computed(() => query.data.value?.data) };
    };

    /**
     * Drops every query of this resource under the current `dependsOn` — records, lists,
     * searches — so the views empty with them; what an active watcher shows is fetched again.
     * Broader than `resetRecords()` (records only).
     */
    const resetAll = (): void => dropQueries(queryClient, keys.inScope(dependsOn()), true);

    /**
     * Fetch several records by id, asking the server only for the missing or stale ones (as a
     * throwaway query).
     *
     * @param apiCall - resolves the missing records
     * @param ids - the record ids (with multiple identifiers, build them with createIdentifier)
     * @param settings - forced / merge / staleTime
     * @returns the requested records, fetched ones first; `undefined` for an id still missing
     */
    const fetchMultiple = (
        apiCall: TMultipleCall<T, K>,
        ids: K[] = [],
        settings: Pick<IFetchSettings, 'forced' | 'merge' | 'staleTime'> = {}
    ): Promise<(T | undefined)[]> => {
        const { cachedIds, expiredIds } = classifyMultiple(ids, settings);
        /** The requested records, fetched ones first. */
        const collect = () => [...expiredIds, ...cachedIds].map((id) => getRecord(id));
        if (expiredIds.length === 0) return Promise.resolve(collect());
        const scopeAtStart = dependsOn();
        const readAt = writeGuard.readClock();
        return settleRead(
            runThrowaway(scopeAtStart, (running) =>
                apiCall(expiredIds, readContextOf(running)).then((items) =>
                    storeBatch(items, scopeAtStart, running, settings, readAt)
                )
            ),
            collect,
            collect
        );
    };

    // dependsOn changed (logout, login, language switch): cancel and drop everything under the
    // old scope, so the old user's data leaves memory. Active watchers follow on their own:
    // their keys embed dependsOn.
    watch(dependsOn, (current, previous) => {
        if (stableKey(current) === stableKey(previous)) return;
        // Move this instance's claim before checking who still needs the old scope: if it was the
        // only one claiming it, releasing first is what makes isLive(previous) false below.
        releaseScope();
        releaseScope = scopeRegistry.claim(current);
        if (scopeRegistry.isLive(previous)) return; // another instance still shows that data
        const inPrevious = keys.inScope(previous);
        // Cancelling never rejects; the drop runs once the old fetches have stopped.
        void queryClient
            .cancelQueries({ predicate: inPrevious })
            .then(() => dropQueries(queryClient, inPrevious));
    });

    /** The public API. */
    const api = {
        // identity and settings
        createIdentifier,
        identifierKey,
        resourceKey,
        maxRecords,

        // the TanStack client, markRaw'd: read or invalidate it from anywhere
        queryClient,

        // records
        itemDictionary,
        itemList,
        setRecords,
        resetRecords,
        resetAll,
        getRecord,
        getRecords,
        addRecord,
        addRecords,
        editRecord,
        editRecords,
        deleteRecord,
        selectedIdentifier,
        selectedRecord,
        lastInsertedIdentifier,
        lastInsertedIdentifiers,
        lastInsertedRecord,

        // client-side pagination
        pageCurrent,
        pageSize,
        pageTotal,
        pageOffset,
        pageItemList,

        // belongsTo relations
        ...relations,

        // loading
        loading: activity.loading,
        isLoading: activity.isLoading,

        // reads
        fetchAny,
        fetchAll,
        fetchByParent,
        fetchTarget,
        fetchMultiple,
        fetchPaginate,
        watchTarget,
        watchAll,
        watchByParent,
        watchAny,

        // writes: createTarget, updateTarget, deleteTarget, mutateAny
        ...mutations,

        // pre-flight freshness checks: checkTarget, checkAll, checkByParent, checkPaginate,
        // checkAny, checkMultiple
        ...freshnessChecks
    };

    /** The machinery `useStructureSearchApi` builds its `'search'` kind on. */
    const engine = {
        queryClient,
        keys,
        dependsOn,
        version: activity.version,
        isFresh,
        staleTimeOf,
        runListQuery,
        listQueryFunction,
        watchQuery
    };

    return { api, engine };
};
