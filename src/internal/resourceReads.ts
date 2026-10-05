/**
 * A resource's one-shot reads (`fetch*`), and the query functions its active watchers share.
 *
 * Each read is a TanStack `fetchQuery` under the resource's key layout, so a fresh entry is served
 * from cache and a concurrent read of the same key joins the running fetch. A read with no
 * stable identity (no id, no key) runs as a throwaway query: `isLoading` sees it, nothing is
 * cached under it. An answer is stored under the scope baked into its own running query's key,
 * never whatever `dependsOn()` reads by the time it lands. A cancelled read resolves with what is
 * cached instead of failing.
 *
 * @module internal/resourceReads
 * @see docs/composables/structure-rest-api.md
 */
import { CancelledError, type QueryClient, type QueryKey } from '@tanstack/vue-query';
import { getUuid } from '@guebbit/js-toolkit';
import type {
    IFetchContext,
    IFetchSettings,
    TListCall,
    TMultipleCall
} from '../composables/structureRestApi.js';
import { isNil } from './plainData.js';
import { DEFAULT_PAGE_SIZE } from './pagination.js';
import type { IListCacheEntry, IResourceKeys, ITargetEntry } from './resourceKeys.js';
import { canWrite } from './recordMutations.js';
import type { IQueryRecordStore } from './queryRecordStore.js';
import type { TInLiveScope } from './liveScope.js';
import { readContextOf, runningQueryOf, type IRunningQuery } from './runningQuery.js';
import type { createResourceWrites, TStoreSettings } from './resourceWrites.js';

/** Extra data a list entry stores next to its ids, computed once the ids are known. */
export type TListExtra<K> = (ids: K[]) => Record<string, unknown>;

/** What the reads need from the resource that owns them. */
export interface IResourceReadsContext<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- record constraint: unknown rejects interfaces without an index signature
    T extends Record<string | number, any>,
    K extends string | number
> {
    /** The one cache. */
    queryClient: QueryClient;

    /** First key segment of every query of this resource. */
    resourceKey: string;

    /** The resource's key layout and scope predicates. */
    keys: IResourceKeys;

    /** Reads the current scope snapshot. */
    dependsOn: () => unknown[];

    /** The resource's default freshness window (ms). */
    staleTime: number;

    /** The record store: scoped reads. */
    store: IQueryRecordStore<T, K>;

    /** Runs a late write only while its scope is still claimed by a live instance. */
    inLiveScope: TInLiveScope;

    /** How answers are stored. */
    writes: ReturnType<typeof createResourceWrites<T, K>>;

    /** The record accessors the reads resolve through. */
    records: {
        /** The id of a record, fabricated when missing. */
        createIdentifier: (item: T) => K;

        /** One record of the current scope, following an alias. */
        getRecord: (id: K) => T | undefined;
    };

    /** Splits ids into those served from cache and those to fetch. */
    classifyMultiple: (
        ids: K[],
        settings: Pick<IFetchSettings, 'forced' | 'staleTime'>
    ) => { cachedIds: K[]; expiredIds: K[] };
}

/**
 * The answer of a cancelled throwaway read: it has no cache entry to fall back on.
 *
 * @returns nothing
 */
const nothing = (): undefined => {
    // no cached answer to return
};

/**
 * The reads of one resource.
 *
 * @param context - see IResourceReadsContext
 * @returns the `fetch*` methods, plus the query functions and helpers the watchers share
 */
export const createResourceReads = <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- record constraint: unknown rejects interfaces without an index signature
    T extends Record<string | number, any>,
    K extends string | number,
    P extends string | number
>({
    queryClient,
    resourceKey,
    keys,
    dependsOn,
    staleTime,
    store,
    inLiveScope,
    writes,
    records,
    classifyMultiple
}: IResourceReadsContext<T, K>) => {
    /** The writes, by name. */
    const { storeItem, storeServerRecord, storeBatch, enforceMaxRecords } = writes;

    /** The record accessors, by name. */
    const { createIdentifier, getRecord } = records;

    /**
     * Removes a query that failed before ever holding data: it is only an error marker. One that
     * holds data keeps serving it. Left alone while a watcher observes it: TanStack never tells an
     * observer its query left the cache, so removing it would silently detach that watcher.
     *
     * @param queryKey - the failed query's key
     */
    const dropIfEmpty = (queryKey: QueryKey): void => {
        // TanStack: a single, atomic predicate — no separate read-then-remove race.
        queryClient.removeQueries({
            queryKey,
            exact: true,
            predicate: (query) => query.getObserversCount() === 0 && query.state.data === undefined
        });
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
     * same data started) resolves with what is cached; a real failure drops the empty entry it
     * may have left, then rethrows.
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
        settings: TStoreSettings,
        running: IRunningQuery,
        extra?: TListExtra<K>
    ): Promise<IListCacheEntry<K>> => {
        const scope = keys.scopeOf(running.queryKey);
        const readAt = performance.now();
        return apiCall(readContextOf(running)).then((items) => {
            const ids = storeBatch(items, scope, running, settings, readAt);
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
        const scope = keys.scopeOf(running.queryKey);
        const readAt = performance.now();
        return apiCall(readContextOf(running)).then((item): ITargetEntry<T> => {
            const unstored = { data: item };
            if (isNil(item) || running.isCancelled()) return unstored;
            return inLiveScope(
                scope,
                () => {
                    const realId = createIdentifier(item);
                    // A mutation on this record owns it: cancel THIS query instead of resolving.
                    // TanStack then reverts it to what is cached, with its ORIGINAL timestamp —
                    // never resurrecting a deleted record, never stamping an optimistic patch fresh
                    // (see recordMutations.ts).
                    if (!canWrite(queryClient, resourceKey, realId, scope, readAt)) {
                        void queryClient.cancelQueries({ queryKey: running.queryKey, exact: true });
                        return { data: undefined };
                    }
                    const targetKey = keys.target(realId, scope);
                    // A single-record read counts toward maxRecords too; only a new id grows the total.
                    if (queryClient.getQueryData<ITargetEntry<T>>(targetKey)?.data === undefined)
                        enforceMaxRecords(1, targetKey, scope);
                    return storeServerRecord(item, id, scope, { merge }, readAt);
                },
                unstored
            );
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
        pageSize = DEFAULT_PAGE_SIZE,
        settings: IFetchSettings = {}
    ) =>
        runListQuery(
            keys.entry('page', dependsOn(), [pageSize, page], settings.key),
            apiCall,
            settings
        );

    /**
     * `fetchTarget` with no id: a throwaway read, stored under the id the answer carries.
     *
     * @param apiCall - resolves the record
     * @param merge - merge into the stored record
     * @returns the stored record
     */
    const fetchUnaddressed = (
        apiCall: (context: IFetchContext) => Promise<T | undefined>,
        merge?: boolean
    ): Promise<T | undefined> => {
        const readAt = performance.now();
        return settleRead(
            // Wrapped: TanStack refuses a query function that resolves undefined. The scope
            // travels with the answer, from the running query's own key.
            runThrowaway(dependsOn(), (running) =>
                apiCall(readContextOf(running)).then((item) => ({
                    data: item,
                    scope: keys.scopeOf(running.queryKey)
                }))
            ),
            ({ data: item, scope }): T | undefined => {
                if (isNil(item)) return item;
                return inLiveScope(
                    scope,
                    () => {
                        const itemId = createIdentifier(item);
                        storeItem(item, itemId, { merge }, scope, readAt);
                        return store.read(itemId);
                    },
                    item
                );
            },
            nothing
        );
    };

    /**
     * Get one record from the server. Cached under `[resourceKey, 'target', dependsOn, id]`: a
     * record has exactly one entry. Without an id there is no entry to read through, so it always
     * asks the server (see fetchUnaddressed).
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
        if (id === undefined) return fetchUnaddressed(apiCall, settings.merge);
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
        const readAt = performance.now();
        return settleRead(
            runThrowaway(dependsOn(), (running) =>
                apiCall(expiredIds, readContextOf(running)).then((items) =>
                    storeBatch(items, keys.scopeOf(running.queryKey), running, settings, readAt)
                )
            ),
            collect,
            collect
        );
    };

    return {
        itemsOf,
        staleTimeOf,
        listQueryFunction,
        targetQueryFunction,
        runListQuery,
        fetchAll,
        fetchByParent,
        fetchPaginate,
        fetchTarget,
        fetchAny,
        fetchMultiple
    };
};
