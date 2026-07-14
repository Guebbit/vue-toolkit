import {
    computed,
    getCurrentScope,
    onScopeDispose,
    reactive,
    ref,
    toRaw,
    watch,
    type WatchSource,
    type WatchStopHandle
} from 'vue';
import { QueryClient, CancelledError } from '@tanstack/query-core';
import { generateFallbackValue, useStructureDataManagement } from '../index';

/**
 * Fetch settings customization
 * If they are NOT set, default behavior will be used
 */
export interface IFetchSettings {
    /**
     * Ignore cache and force the request anyway
     */
    forced?: boolean;

    /**
     * Enable loading during promises
     */
    loading?: boolean;

    /**
     * When I don't want to replace the data but merge it instead with the existing one
     * (replacing only the old fields with the new ones)
     *
     * This could happen because I use different fetches that return different fields for the same item
     *
     * Example:
     * I could have a fetch call with custom lastUpdateKey that retrieves a list of items that I have already and maybe with a valid TTL.
     * Without merge I would just refresh like a  soft-forced. With merge I can update the items with new data
     */
    merge?: boolean;

    /**
     * staleTime override for this specific request (maps to TanStack Query staleTime).
     * Example: if you set a 10 min TTL instead of the default 1 hour,
     * the data will be considered "stale" after 10 minutes
     * and a new request will be made to refresh it
     */
    TTL?: number;

    /**
     * Appended to the TanStack query key to create independent cache buckets,
     * e.g. one per server-side page.
     */
    lastUpdateKey?: string;

    /**
     * Change the key used for loading management
     */
    loadingKey?: string;

    /**
     * When true, skip updating the per-item TARGET cache after saving fetched records.
     * Use when the fetch returns partial data that should not reset the item's own cache validity.
     */
    mismatch?: boolean;

    /**
     * createTarget/updateTarget only: populate the per-item target cache as if this
     * record had just been fetched via fetchTarget, so a later fetchTarget(id) is a
     * cache hit instead of an extra request.
     */
    fetchLike?: boolean;

    /**
     * updateTarget only: after the request resolves, apply its response as the
     * record's new data (addRecord/editRecord + reseed the target cache). Turn off
     * when the apiCall's response shouldn't be trusted as the record's full state
     * (e.g. it returns just an acknowledgement, not the updated item).
     */
    fetchAgain?: boolean;
}

/**
 * Composable customization settings
 */
export interface IStructureRestApi {
    // The identification parameter of the item (READONLY and not exported)
    // WARNING: ORDER SENSITIVE (if multiple). VERY IMPORTANT.
    identifiers?: string | string[];
    // Unique key for loading management (If falsy: doesn't update the global loading state)
    loadingKey?: string;
    // Time To Live (staleTime) for the various fetches, in milliseconds
    TTL?: number;
    /**
     * Hard upper bound on itemDictionary size. When a fetched batch would push the
     * dictionary past it, the WHOLE client store is wiped before the batch is stored
     * (see resetAll). 0 disables it.
     *
     * This is a critical-mass backstop, NOT a cache policy. Records are never dropped
     * for being old: stale data is useful data — it keeps the list on screen while the
     * fresh copy downloads. A record is garbage only when nothing points at it, and age
     * says nothing about that. So there is no TTL on the dictionary and no eviction tied
     * to query-cache expiry; the store is thrown away only when it grows absurd.
     * (useStructureSearchApi's searchCached applies the same idea from the other
     * end: it is capped at MAX_SEARCHES = 50 buckets rather than expired by age.)
     *
     * WARNING: a wipe empties `itemList` / `pageItemList` / `selectedRecord`. Harmless
     * for a server-paginated UI (the incoming batch is stored right after, so the page
     * being rendered is intact), VISIBLE for an infinite-scroll UI that renders itemList
     * directly — there the list collapses to the last batch. Set 0 and prune manually
     * if that matters. At the default 100k (~20MB of plain records) it should never fire.
     */
    maxRecords?: number;
    // Delimiter for multiple identifiers
    delimiter?: string;
    getLoading?: (key?: string) => boolean;
    setLoading?: (key?: string, value?: boolean) => void;
    /**
     * Optional external QueryClient instance. When omitted a new QueryClient is
     * created internally with sensible defaults derived from the TTL setting.
     */
    queryClient?: QueryClient;
}

export const useStructureRestApi = <
    // type of item
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends Record<string | number, any> = Record<string, any>,
    // type of item[identifier] (Extract only "string" or "number", because "symbol" is a pain to manage)
    K extends string | number = Extract<keyof T, string | number>,
    // type of parent[identifier], where the parent is in a relation "belogsTo" with an unknown data
    // WARNING: Typescript is not inferring correctly between different composables and use the default type
    P extends string | number = string | number
>({
    identifiers = 'id',
    loadingKey = generateFallbackValue(),
    TTL = 3_600_000, // 1 hour
    maxRecords = 100_000,
    delimiter = '|',
    getLoading,
    setLoading,
    queryClient: queryClientExternal
}: IStructureRestApi = {}) => {
    /**
     * Inherited
     */
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
        deleteRecord,
        selectedIdentifier,
        selectedRecord,
        lastInsertedIdentifier,
        lastInsertedIdentifiers,
        lastInsertedRecord,

        // Pagination
        pageCurrent,
        pageSize,
        pageTotal,
        pageOffset,
        pageItemList,

        // belongsTo relationship
        parentHasMany,
        addToParent,
        removeFromParent,
        removeDuplicateChildren,
        getRecordsByParent,
        getListByParent
    } = useStructureDataManagement<T, K, P>(identifiers, delimiter);

    /**
     * loadings
     *
     * Loading is ref-counted, not a boolean: overlapping requests on the same key
     * would otherwise clear each other's loading state (the first to resolve wins).
     * The external setLoading/getLoading store keeps its boolean contract — it's only
     * told about the 0 -> 1 and 1 -> 0 transitions.
     */
    // In-flight requests per full loading key (loadingKey + postfix).
    // reactive() (not a plain Map) so the _pending computed below can track it.
    // A key is deleted rather than left at 0, so "is anything pending" is just "is it non-empty".
    const _pendingByKey = reactive(new Map<string, number>());
    // In-flight requests across every postfix — the internal fallback flag
    const _pending = computed(() => _pendingByKey.size > 0);

    // loading mutators
    const startLoading = (postfix = '') => {
        const key = loadingKey + postfix;
        const pending = (_pendingByKey.get(key) ?? 0) + 1;
        _pendingByKey.set(key, pending);
        // The external store keeps a boolean contract: only tell it about the 0 -> 1 edge
        if (pending === 1 && loadingKey && setLoading) setLoading(key, true);
    };
    const stopLoading = (postfix = '') => {
        const key = loadingKey + postfix;
        const pending = _pendingByKey.get(key) ?? 0;
        // Never go negative: an unmatched stopLoading must not clear a real in-flight request
        if (pending === 0) return;
        if (pending > 1) {
            _pendingByKey.set(key, pending - 1);
            return;
        }
        _pendingByKey.delete(key);
        if (loadingKey && setLoading) setLoading(key, false);
    };
    // Check if it's loading
    const loading = computed(() => (getLoading ? getLoading(loadingKey) : _pending.value));

    /**
     * TanStack QueryClient — freshness, request de-duplication and revalidation engine.
     * A new instance is created per composable unless an external one is provided.
     *
     * OWNERSHIP (do not blur these two):
     *  - `itemDictionary` owns WHAT TO RENDER. It is the client store: synchronous,
     *    reactive, and the only thing consumers read (getRecord / itemList / ...).
     *    Its lifetime is the owning scope's; prune it with `resetRecords()`.
     *  - this cache owns WHEN TO FETCH: is an entry stale, is a request already in
     *    flight, should it retry. Nothing renders from it.
     *
     * Consequence: an entry garbage-collected after `gcTime` only means "we forgot
     * that this item was fresh" — the next read refetches it. It must NEVER evict the
     * item from the dictionary: with no query observers (nothing here calls useQuery)
     * every entry is gc-eligible from birth, so doing so would delete data out from
     * under a component that is still rendering it.
     *
     * This split is also what gives stale-while-revalidate for free: an expired TTL
     * leaves the item in the dictionary, so `getRecord` keeps serving the old value
     * for the whole flight of the refetch, and `saveRecords` swaps in the new one.
     */
    const _queryClient: QueryClient =
        queryClientExternal ??
        new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false,
                    // Outlive the TTL, else an entry could be collected while still fresh
                    gcTime: Math.max(TTL, 5 * 60 * 1000),
                    // Never perform real network-status checks; always trust the queryFn result
                    networkMode: 'always'
                }
            }
        });

    /**
     * Tear down this composable: for a client we created, clear it (removing every
     * query and cancelling the background gc timers) so nothing leaks after the
     * owner (component, store, service) is gone.
     *
     * Auto-wired to the current Vue effect scope (component `setup`, Pinia setup
     * store, `effectScope`) so it runs on teardown for free. When there is no active
     * scope (plain/standalone usage) nothing is registered and no warning is emitted;
     * call `destroy()` yourself in that case.
     *
     * The dictionary and the search indexes are reset too: their lifetime is the
     * lifetime of this composable. This is teardown, NOT gc — the query cache's gc
     * timers must never evict dictionary items (see the ownership note above
     * `_queryClient`); only the owning scope going away may.
     *
     * @param forced - also clear an externally-provided queryClient (normally left alone)
     */
    const destroy = (forced = false): void => {
        if (forced || !queryClientExternal) _queryClient.clear();
        resetAll();
    };
    if (getCurrentScope()) onScopeDispose(destroy);

    /**
     * Returns true when the TanStack cache entry for the given key is still
     * within its stale window (i.e. data age < staleTime).
     */
    const isQueryFresh = (queryKey: unknown[], staleTime: number): boolean => {
        if (staleTime <= 0) return false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const state = _queryClient.getQueryState(queryKey as any);
        return Boolean(state?.dataUpdatedAt && Date.now() - state.dataUpdatedAt < staleTime);
    };

    /**
     * The per-item "target" cache is the single, consistent representation read by
     * fetchTarget. Its value is ALWAYS wrapped as { data } so a legitimately
     * `undefined` item stays distinguishable from a missing entry (TanStack Query v5
     * forbids caching a bare `undefined`). Every producer — fetchAll/fetchPaginate/
     * fetchByParent/fetchMultiple/createTarget/updateTarget — seeds through
     * seedTarget, so the shape never diverges and fetchTarget can always unwrap it.
     *
     * Key order is [loadingKey, 'target', id, lastUpdateKey]: `id` precedes `lastUpdateKey`
     * so that [loadingKey, 'target', id] prefix-matches EVERY lastUpdateKey bucket of one
     * item, which is what deleteTarget needs to evict.
     */
    type TargetEntry = { data: T | undefined };
    const targetKey = (id: K, lastUpdateKey = ''): unknown[] => [
        loadingKey,
        'target',
        id,
        lastUpdateKey
    ];
    /** Prefix matching every cached bucket of one item, regardless of lastUpdateKey */
    const targetKeyPrefix = (id: K): unknown[] => [loadingKey, 'target', id];
    const seedTarget = (id: K, item: T | undefined, lastUpdateKey = ''): void => {
        _queryClient.setQueryData<TargetEntry>(targetKey(id, lastUpdateKey), { data: item });
    };

    /**
     * Common save routine shared by all fetch* methods: writes each fetched
     * item into the local store (addRecord/editRecord) and, when supplied,
     * runs onSave per item to let the caller do extra bookkeeping
     * (e.g. syncing the per-item TanStack target cache).
     *
     * Enforces maxRecords BEFORE storing the batch, so the incoming (freshest) items
     * always survive the wipe: what the caller just asked for stays renderable.
     *
     * @param items
     * @param merge - true: editRecord (merge fields into existing item), false: addRecord (replace)
     * @param onSave - customized single item operations
     */
    function saveRecords(items: (T | undefined)[] = [], merge = false, onSave?: (item: T) => void) {
        // Critical mass only. Nothing is dropped for being stale — stale records are the
        // ones keeping the UI populated while fresher data is on its way. Past maxRecords
        // the whole store goes, and the batch below immediately repopulates it.
        if (maxRecords > 0 && Object.keys(itemDictionary.value).length + items.length > maxRecords)
            resetAll();

        for (let i = 0, len = items.length; i < len; i++) {
            if (!items[i]) continue;
            if (merge) editRecord(items[i]);
            else addRecord(items[i]!);
            if (onSave) onSave(items[i]!);
        }
        return items;
    }

    /**
     * The fetch protocol every cached fetch* method obeys, written once:
     *   forced  -> drop the entry so fetchQuery can't treat it as fresh
     *   loading -> count this request in
     *   run through the cache (fetchQuery returns the cached value while it is fresh)
     *   on failure, drop the entry so the call can be retried
     *   loading -> count this request out, success or not
     *
     * The methods differ ONLY in their query key and in what they do with the data,
     * so those are the only two things they pass in. This helper takes no behavioural
     * flags: anything that needs to opt out of the protocol (fetchTarget without an id,
     * fetchMultiple's per-id fan-out) stays outside it, visibly, in its own method.
     *
     * @key R - what the cache stores: an item array, or a { data } wrapper
     * @key X - what the caller gets back, once onData has interpreted R
     *
     * @param queryKey
     * @param queryFunction - produces R (usually the caller's apiCall, sometimes wrapped)
     * @param settings - the per-call settings the caller already received
     * @param onData   - interpret + store the result; omitted when the raw R is returned as-is
     */
    const runQuery = <R, X = R>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        queryKey: any[],
        queryFunction: () => Promise<R>,
        {
            forced = false,
            loading = true,
            loadingKey: lk,
            TTL: customTTL
        }: Pick<IFetchSettings, 'forced' | 'loading' | 'loadingKey' | 'TTL'> = {},
        onData?: (data: R) => X
    ): Promise<X> => {
        if (forced) _queryClient.removeQueries({ queryKey, exact: true });

        if (loading) startLoading(lk);

        return _queryClient
            .fetchQuery<R>({ queryKey, queryFn: queryFunction, staleTime: customTTL ?? TTL })
            .then((data: R) => (onData ? onData(data) : (data as unknown as X)))
            .catch((error: unknown) => {
                // A cancellation (e.g. a concurrent updateTarget/deleteTarget cancelling this
                // same in-flight fetch to apply its own, newer value first) is NOT a failure —
                // it must never surface as a rejection to whoever called this fetch. They just
                // get back whatever is currently cached (their own optimistic edit already won)
                // instead of an error. Only a genuine fetch failure clears the entry and rejects.
                if (error instanceof CancelledError) {
                    const cached = _queryClient.getQueryData<R>(queryKey);
                    return cached === undefined
                        ? (undefined as X)
                        : onData
                          ? onData(cached)
                          : (cached as unknown as X);
                }
                // Remove the failed entry so it can be retried
                _queryClient.removeQueries({ queryKey, exact: true });
                throw error;
            })
            .finally(() => loading && stopLoading(lk));
    };

    /**
     * Generic fetch for all types of requests.
     * Just for loading management and optional TanStack-backed caching.
     * When no lastUpdateKey is supplied the call is always executed without caching.
     *
     * @key F - type of the response, that can be anything
     * @param apiCall  - call that we are going to make
     * @param forced
     * @param loading
     * @param lastUpdateKey
     * @param loadingKey
     * @param TTL - per-call staleTime override
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchAny = <F = any>(
        apiCall: () => Promise<F>,
        {
            forced = false,
            loading = true,
            lastUpdateKey = '',
            loadingKey: lk,
            TTL: customTTL
        }: Omit<IFetchSettings, 'merge'> = {}
    ): Promise<F | undefined> => {
        // No cache key provided — always execute, outside the cache and outside runQuery
        if (!lastUpdateKey) {
            if (loading) startLoading(lk);
            return apiCall().finally(() => loading && stopLoading(lk));
        }

        // Namespaced by loadingKey + lastUpdateKey so unrelated fetchAny calls don't share a cache slot
        // No onData: the raw response is cached and returned untouched, never stored as records
        return runQuery([loadingKey, 'any', lastUpdateKey], apiCall, {
            forced,
            loading,
            loadingKey: lk,
            TTL: customTTL
        });
    };

    /**
     * Get ALL items from server.
     * Uses TanStack QueryClient for caching and freshness (staleTime = TTL).
     * When the cache is still fresh the apiCall is skipped entirely.
     *
     * @param apiCall
     * @param forced     - bypass cache
     * @param loading
     * @param merge
     * @param lastUpdateKey - appended to the query key to namespace independent cache entries
     * @param loadingKey
     * @param mismatch   - see IFetchSettings
     * @param TTL        - per-call staleTime override
     */
    const fetchAll = (
        apiCall: () => Promise<(T | undefined)[]>,
        {
            forced = false,
            loading = true,
            merge,
            lastUpdateKey = '',
            loadingKey: lk,
            mismatch = false,
            TTL: customTTL
        }: IFetchSettings = {}
    ): Promise<(T | undefined)[]> => {
        // One cache slot per (loadingKey, lastUpdateKey) — every "all" fetch with the same pair shares it
        const queryKey = [loadingKey, 'all', lastUpdateKey];

        return runQuery(
            queryKey,
            apiCall,
            { forced, loading, loadingKey: lk, TTL: customTTL },
            // Store each fetched item locally; also seed its own "target" query
            // cache entry so a later fetchTarget(id) call sees it as fresh —
            // unless mismatch, since these items may carry only partial fields
            (items: (T | undefined)[] = []) =>
                saveRecords(
                    items,
                    merge,
                    mismatch ? undefined : (item: T) => seedTarget(createIdentifier(item), item)
                )
        );
    };

    /**
     * Same as fetchAll, but with a parent identifier (belongsTo relationship).
     *
     * @param apiCall
     * @param parentId - identifier of parent
     *                   WARNING: in case of multiple identifiers, createIdentifier(id) must be used!
     * @param forced
     * @param loading
     * @param merge
     * @param lastUpdateKey
     * @param loadingKey
     * @param mismatch - see IFetchSettings
     * @param TTL      - per-call staleTime override
     */
    const fetchByParent = (
        apiCall: () => Promise<(T | undefined)[]>,
        parentId: P,
        {
            forced = false,
            loading = true,
            merge,
            lastUpdateKey = '',
            loadingKey: lk,
            mismatch = false,
            TTL: customTTL
        }: IFetchSettings = {}
    ): Promise<(T | undefined)[]> => {
        // parentId is folded into the key so each parent gets its own cache slot
        const queryKey = [loadingKey, 'parent', lastUpdateKey + String(parentId)];

        return runQuery(
            queryKey,
            apiCall,
            { forced, loading, loadingKey: lk, TTL: customTTL },
            (items: (T | undefined)[] = []) => {
                for (let i = 0, len = items.length; i < len; i++) {
                    if (!items[i]) continue;
                    addToParent(parentId, createIdentifier(items[i]!) as string);

                    // if mismatch, we don't want to overwrite the fetchTarget's item so we merge
                    if (merge || mismatch) editRecord(items[i]);
                    else addRecord(items[i]!);

                    // Keep per-item target caches in sync unless mismatched partial data
                    if (!mismatch) seedTarget(createIdentifier(items[i]!), items[i]);
                }
                removeDuplicateChildren(parentId);
                return items;
            }
        );
    };

    /**
     * Get target item from server.
     * Per-item freshness is tracked via TanStack query key [loadingKey, 'target', lastUpdateKey, id].
     *
     * @param apiCall
     * @param id - can be undefined if we don't know yet the id
     *             WARNING: in case of multiple identifiers, createIdentifier(id) must be used!
     * @param forced
     * @param loading
     * @param merge
     * @param lastUpdateKey
     * @param loadingKey
     * @param TTL - per-call staleTime override
     */
    const fetchTarget = (
        apiCall: () => Promise<T | undefined>,
        id?: K,
        {
            forced = false,
            loading = true,
            merge,
            lastUpdateKey = '',
            loadingKey: lk,
            TTL: customTTL
        }: IFetchSettings = {}
    ): Promise<T | undefined> => {
        // Without an id we cannot build a stable query key — always execute
        if (id === undefined) {
            if (loading) startLoading(lk);
            return apiCall()
                .then((item: T | undefined) => {
                    if (!item) return;
                    return saveRecords([item], merge)[0];
                })
                .finally(() => loading && stopLoading(lk));
        }

        // One cache slot per item id, so each target is freshness-tracked independently.
        // The target cache always holds { data } (see seedTarget), so a legitimate
        // `undefined` item is never mistaken for a missing entry, and fetchTarget can
        // unwrap whatever a producer seeded — list, search, parent, create or update.
        return runQuery<TargetEntry, T | undefined>(
            targetKey(id, lastUpdateKey),
            () => apiCall().then((item) => ({ data: item })),
            { forced, loading, loadingKey: lk, TTL: customTTL },
            ({ data: item }: TargetEntry) => {
                if (!item) return;
                return saveRecords([item], merge)[0];
            }
        );
    };

    /**
     * fetchTarget's reactive counterpart: watches an id source (Ref, ComputedRef, or
     * getter — anything `watch()` accepts) and re-runs fetchTarget every time it
     * changes, selecting the record as it goes. Covers both the "fetch once on mount"
     * and the "refetch when the id changes" cases with a single watcher, since a
     * `watch` with `immediate: true` already fires synchronously during setup.
     *
     * @param idSource   - Ref/ComputedRef/getter producing the current id
     * @param apiCall    - id-parametrized, since the id changes over time
     * @param onSuccess  - called with the fetched item after a successful fetch
     * @param onError    - called with the error after a failed fetch (which is
     *                     otherwise swallowed here, same as an unhandled watch callback)
     * @param onSettled  - called after either outcome
     * @param settings   - forwarded to fetchTarget (forced, loading, merge, TTL, ...)
     */
    const watchTarget = (
        idSource: WatchSource<K | undefined | null>,
        apiCall: (id: K) => Promise<T | undefined>,
        {
            onSuccess,
            onError,
            onSettled,
            ...settings
        }: IFetchSettings & {
            onSuccess?: (item: T | undefined, id: K) => void;
            onError?: (error: unknown, id: K) => void;
            onSettled?: (item: T | undefined, error: unknown, id: K) => void;
        } = {}
    ): WatchStopHandle =>
        watch(
            idSource,
            (id) => {
                // Undefined/nullish ID = do nothing
                if (id === undefined || id === null) return;

                selectedIdentifier.value = id;

                return fetchTarget(() => apiCall(id), id, settings)
                    .then((item) => {
                        onSuccess?.(item, id);
                        onSettled?.(item, undefined, id);
                        return item;
                    })
                    .catch((error: unknown) => {
                        selectedIdentifier.value = undefined;
                        onError?.(error, id);
                        onSettled?.(undefined, error, id);
                    });
            },
            { immediate: true }
        );

    /**
     * Split ids into ones whose target cache entry is still fresh (cachedIds, served
     * without a network call) vs missing/stale (expiredIds, must be re-fetched).
     * Shared by fetchMultiple (which then fetches expiredIds) and checkMultiple
     * (which only reports the split, see the pre-flight checks section below) —
     * written once so the two can never disagree about what counts as fresh.
     *
     * @param ids
     * @param lastUpdateKey
     * @param forced - true: skip the freshness check entirely, everything is "expired"
     * @param staleTime
     */
    const classifyMultiple = (
        ids: K[],
        lastUpdateKey = '',
        forced = false,
        staleTime = TTL
    ): { cachedIds: K[]; expiredIds: K[] } => {
        const expiredIds: K[] = [];
        const cachedIds: K[] = [];
        for (const id of ids) {
            if (!forced && isQueryFresh(targetKey(id, lastUpdateKey), staleTime))
                cachedIds.push(id);
            else expiredIds.push(id);
        }
        return { cachedIds, expiredIds };
    };

    /**
     * Fetch multiple items by id, batching only the ones that are stale.
     * Items with a fresh TanStack cache entry are returned immediately without
     * hitting the network; expired items are requested via a single apiCall.
     *
     * @param apiCall
     * @param ids - Array of ids
     *              WARNING: in case of multiple identifiers, createIdentifier(id) must be used!
     * @param forced
     * @param loading
     * @param merge
     * @param loadingKey
     * @param lastUpdateKey
     * @param TTL - per-call staleTime override
     */
    const fetchMultiple = (
        apiCall: () => Promise<(T | undefined)[]>,
        ids?: K[],
        {
            forced = false,
            loading = true,
            merge,
            loadingKey: lk,
            lastUpdateKey = '',
            TTL: customTTL
        }: IFetchSettings = {}
    ): Promise<(T | undefined)[]> => {
        // nothing to search
        if (!ids || ids.length === 0) return Promise.resolve([]);

        const { cachedIds, expiredIds } = classifyMultiple(
            ids,
            lastUpdateKey,
            forced,
            customTTL ?? TTL
        );

        // items that I already have
        const cachedItems = cachedIds.map((id) => getRecord(id));

        // If no ids are expired, no need to make a fetch
        if (expiredIds.length === 0) return Promise.resolve(cachedItems);

        if (loading) startLoading(lk);

        // request
        return apiCall()
            .then((items: (T | undefined)[] = []) => [
                ...saveRecords(items, merge, (item: T) =>
                    seedTarget(createIdentifier(item), item, lastUpdateKey)
                ),
                ...cachedItems
            ])
            .catch((error: unknown) => {
                // Remove failed entries so they can be retried
                for (const id of expiredIds)
                    _queryClient.removeQueries({
                        queryKey: targetKey(id, lastUpdateKey),
                        exact: true
                    });
                throw error;
            })
            .finally(() => loading && stopLoading(lk));
    };

    /**
     * Wipe the whole client store: records AND every structure that holds bare ids
     * (currently just parentHasMany — see removeDuplicateChildren/getRecordsByParent).
     *
     * Does not touch the TanStack cache: its entries stay valid and a later fetch
     * repopulates the dictionary from them without hitting the network.
     *
     * NOTE for callers layering their own id-indexed bookkeeping on top of this
     * composable (e.g. useStructureSearchApi's searchCached): dropping records here
     * leaves THEIR ids dangling, and getRecords() silently filters those out. If you
     * built a searchApi on top of this instance, also call its resetSearches() when
     * you call this (or destroy()).
     */
    const resetAll = () => {
        resetRecords();
        parentHasMany.value = {} as typeof parentHasMany.value;
    };

    /**
     * Query key of one server-paginated page. This composable has no concept of a
     * "filter" or "search" — only pages, cached strictly by (lastUpdateKey, pageSize,
     * page). A search/pagination layer built on top (see useStructureSearchApi)
     * derives its own stable key from filters and passes it in as lastUpdateKey,
     * getting one cache bucket per distinct filter set without this file ever
     * needing to know what a filter is.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paginateKeyFor = (page: number, pageSize: number, lastUpdateKey = ''): any[] => [
        loadingKey,
        'paginate',
        lastUpdateKey,
        pageSize,
        page
    ];

    /**
     * fetchAll, one server-paginated page at a time. This is a generic paginated
     * fetch, not a search — apiCall resolves with plain items. A caller that also
     * needs a server-reported total (e.g. useStructureSearchApi.fetchSearch) reads
     * it out of its own apiCall wrapper; this composable has nothing to do with it.
     *
     * @param apiCall
     * @param page
     * @param pageSize - page size used for caching
     * @param forced
     * @param loading
     * @param merge
     * @param lastUpdateKey - namespaces independent cache buckets (e.g. per filter set)
     * @param loadingKey
     * @param mismatch
     * @param TTL - per-call staleTime override
     */
    const fetchPaginate = (
        apiCall: () => Promise<(T | undefined)[]>,
        page = 1,
        pageSize = 10,
        {
            forced = false,
            loading = true,
            merge,
            lastUpdateKey = '',
            loadingKey: lk,
            mismatch = false,
            TTL: customTTL
        }: IFetchSettings = {}
    ): Promise<(T | undefined)[]> =>
        runQuery<(T | undefined)[]>(
            paginateKeyFor(page, pageSize, lastUpdateKey),
            apiCall,
            { forced, loading, loadingKey: lk, TTL: customTTL },
            (items: (T | undefined)[] = []) =>
                saveRecords(
                    items,
                    merge,
                    mismatch ? undefined : (item: T) => seedTarget(createIdentifier(item), item)
                )
        );

    /**
     * ---------------------------- PRE-FLIGHT FRESHNESS CHECKS -----------------------------
     *
     * "Would this call be served from cache, or would it hit the network?" — answered
     * synchronously, without calling apiCall or touching loading state. Each check builds
     * the exact query key its fetch* counterpart uses, so an entry reported fresh here is
     * the same entry that fetch* would reuse instead of refetching.
     *
     * There is no `forced` parameter: a forced call always fetches, so there is nothing
     * to check. Being synchronous, a check's result only holds until the next microtask
     * that might mutate the cache (e.g. an awaited fetch elsewhere) — treat it as advisory
     * for the immediate next call, not as a durable state to hold onto.
     */

    /**
     * Would fetchTarget(apiCall, id, settings) be served from cache?
     * @param id
     * @param lastUpdateKey
     * @param TTL - mirrors the per-call staleTime override you'd pass to fetchTarget
     */
    const checkTarget = (
        id: K,
        { lastUpdateKey = '', TTL: customTTL }: Pick<IFetchSettings, 'lastUpdateKey' | 'TTL'> = {}
    ): boolean => isQueryFresh(targetKey(id, lastUpdateKey), customTTL ?? TTL);

    /**
     * Would fetchAll(apiCall, settings) be served from cache?
     */
    const checkAll = ({
        lastUpdateKey = '',
        TTL: customTTL
    }: Pick<IFetchSettings, 'lastUpdateKey' | 'TTL'> = {}): boolean =>
        isQueryFresh([loadingKey, 'all', lastUpdateKey], customTTL ?? TTL);

    /**
     * Would fetchByParent(apiCall, parentId, settings) be served from cache?
     */
    const checkByParent = (
        parentId: P,
        { lastUpdateKey = '', TTL: customTTL }: Pick<IFetchSettings, 'lastUpdateKey' | 'TTL'> = {}
    ): boolean =>
        isQueryFresh([loadingKey, 'parent', lastUpdateKey + String(parentId)], customTTL ?? TTL);

    /**
     * Would fetchAny(asyncCall, settings) be served from cache? Without a lastUpdateKey,
     * fetchAny never caches at all — always false, matching fetchAny's own rule.
     */
    const checkAny = (
        lastUpdateKey = '',
        { TTL: customTTL }: Pick<IFetchSettings, 'TTL'> = {}
    ): boolean =>
        lastUpdateKey ? isQueryFresh([loadingKey, 'any', lastUpdateKey], customTTL ?? TTL) : false;

    /**
     * Would fetchPaginate(apiCall, page, pageSize, settings) be served from cache?
     */
    const checkPaginate = (
        page = 1,
        pageSize = 10,
        { lastUpdateKey = '', TTL: customTTL }: Pick<IFetchSettings, 'lastUpdateKey' | 'TTL'> = {}
    ): boolean => isQueryFresh(paginateKeyFor(page, pageSize, lastUpdateKey), customTTL ?? TTL);

    /**
     * Would fetchMultiple(apiCall, ids, settings) skip the network for some, all, or
     * none of the given ids? Mirrors fetchMultiple's own per-id split (classifyMultiple):
     * cachedIds would be served without a request, expiredIds would trigger the one
     * batched apiCall fetchMultiple makes to cover all of them.
     */
    const checkMultiple = (
        ids: K[] = [],
        { lastUpdateKey = '', TTL: customTTL }: Pick<IFetchSettings, 'lastUpdateKey' | 'TTL'> = {}
    ): { cachedIds: K[]; expiredIds: K[] } =>
        classifyMultiple(ids, lastUpdateKey, false, customTTL ?? TTL);

    /**
     * Mark every 'all' / 'search' / 'parent' query of this composable as stale.
     *
     * There are no live query observers in this file (nothing calls useQuery), so
     * invalidateQueries only flips each entry's isInvalidated flag — it does NOT
     * trigger a network request by itself. The next explicit fetchAll/fetchSearch/
     * fetchByParent call is what actually refetches, via runQuery's normal
     * fetchQuery -> isStaleByTime check picking up the invalidated flag.
     *
     * Called after createTarget/deleteTarget succeed: a created or deleted record
     * changes what a list-shaped fetch should return, even though the record's own
     * data is already correct in itemDictionary/target cache regardless.
     */
    const invalidateListQueries = (): void => {
        _queryClient.invalidateQueries({
            predicate: (query) => {
                const [lk, kind] = query.queryKey as [string, string];
                return (
                    lk === loadingKey &&
                    (kind === 'all' || kind === 'paginate' || kind === 'parent')
                );
            }
        });
    };

    /**
     * dummyData: Create data immediately and then update it later
     * when the server returns the real data
     *
     * @param apiCall
     * @param dummyData
     * @param loading
     * @param lastUpdateKey
     * @param loadingKey
     * @param fetchLike - data of the created item will be considered fetched like in fetchTarget
     */
    const createTarget = (
        apiCall: () => Promise<T | undefined>,
        dummyData?: T,
        {
            loading = true,
            lastUpdateKey = '',
            loadingKey: lk,
            fetchLike = true
        }: Omit<IFetchSettings, 'forced' | 'merge' | 'fetchAgain'> = {}
    ): Promise<T | undefined> => {
        const temporaryId = generateFallbackValue();
        // Create temporary item with temporary id for instantaneity
        if (dummyData) editRecord(dummyData, temporaryId as K, true);
        if (loading) startLoading(lk);
        // request
        return apiCall()
            .then((item: T | undefined) => {
                if (!item) return;
                const id = createIdentifier(item);

                // Remove the temporary item and add the real one
                if (dummyData) deleteRecord(temporaryId as K);

                addRecord(item);

                // Populate the per-item target cache
                if (fetchLike) seedTarget(id, item, lastUpdateKey);
                // A new record can belong in cached lists that don't know about it yet
                invalidateListQueries();
                return getRecord(id);
            })
            .catch((error: unknown) => {
                // rollback
                deleteRecord(temporaryId as K);
                throw error;
            })
            .finally(() => loading && stopLoading(lk));
    };

    /**
     * Update an existing record
     *
     * @key F - type of the response, that can be something else than T
     * @param apiCall
     * @param itemData
     * @param id - if undefined it will be inferred
     *          WARNING: in case of multiple identifiers, createIdentifier(id) must be used!
     * @param loading
     * @param merge
     * @param lastUpdateKey
     * @param loadingKey
     * @param fetchLike - data will be considered fetched like in fetchTarget
     * @param fetchAgain - after the update, the call can return the updated item, update in this case (for consistency)
     */
    const updateTarget = <F = T>(
        apiCall: () => Promise<F | (T | undefined)[]>,
        itemData: Partial<T>,
        id?: K,
        {
            loading = true,
            merge,
            lastUpdateKey = '',
            loadingKey: lk,
            fetchLike = true,
            fetchAgain = true
        }: Omit<IFetchSettings, 'forced'> = {}
    ): Promise<F | (T | undefined)[]> => {
        // Resolve the target id up front: the rollback needs it even when the caller
        // didn't pass one (editRecord would otherwise infer it internally)
        const targetId = id ?? createIdentifier(itemData as T);

        // Snapshot to restore in case of error. Deep-cloned and detached from the store:
        // the optimistic merge below can mutate nested objects the live record shares
        const previousItemData = getRecord(targetId);
        const rollbackData = previousItemData
            ? (structuredClone(toRaw(previousItemData)) as T)
            : undefined;

        // Cancel any in-flight fetchTarget for this id (any lastUpdateKey bucket) first:
        // otherwise an older response can resolve after the optimistic edit below and
        // clobber it with pre-update data. Mirrors TanStack's documented optimistic-update
        // recipe (cancelQueries before the optimistic write).
        return _queryClient.cancelQueries({ queryKey: targetKeyPrefix(targetId) }).then(() => {
            // for instantaneity, but can be inconsistent
            editRecord(itemData, targetId, true);

            if (loading) startLoading(lk);

            return apiCall()
                .then((data) => {
                    // If the apiCall returns the updated item, editRecord will be called again to ensure data consistency
                    if (fetchAgain) {
                        if (merge) editRecord(data as T, id);
                        else addRecord(data as T);
                    }

                    // Refresh per-item target cache — fall back to createIdentifier(data)
                    // when id wasn't passed in (e.g. it was inferred from the response)
                    if (fetchLike || fetchAgain)
                        seedTarget(id ?? createIdentifier(data as T), data as T, lastUpdateKey);

                    return data;
                })
                .catch((error: unknown) => {
                    // Rollback in case of error.
                    // addRecord (not editRecord) because the rollback must replace the record
                    // wholesale: editRecord merges, so any field *added* by the optimistic
                    // update would survive it. If the record didn't exist, the optimistic
                    // update created it, so undoing means removing it.
                    if (rollbackData) addRecord(rollbackData);
                    else deleteRecord(targetId);
                    throw error;
                })
                .finally(() => loading && stopLoading(lk));
        });
    };

    /**
     *
     * @key F - type of the response
     * @param apiCall
     * @param id - WARNING: in case of multiple identifiers, createIdentifier(id) must be used!
     * @param loading
     * @param loadingKey - custom loading key
     */
    const deleteTarget = <F = unknown>(
        apiCall: () => Promise<F>,
        id: K,
        { loading = true, loadingKey: lk }: Pick<IFetchSettings, 'loading' | 'loadingKey'> = {}
    ): Promise<F> => {
        // in case revert is needed
        const oldItemData = getRecord(id);

        // Cancel any in-flight fetchTarget for this id first, same reasoning as updateTarget:
        // an older response resolving after the delete below would re-add stale data.
        return _queryClient.cancelQueries({ queryKey: targetKeyPrefix(id) }).then(() => {
            deleteRecord(id);
            // Remove from TanStack cache optimistically.
            // Prefix match (not exact): a deleted item must not survive in a lastUpdateKey bucket
            _queryClient.removeQueries({ queryKey: targetKeyPrefix(id) });
            if (loading) startLoading(lk);
            return apiCall()
                .then((result) => {
                    // Cached lists may still list this id; make them refetch next time
                    invalidateListQueries();
                    return result;
                })
                .catch((error: unknown) => {
                    // Rollback in case of error
                    if (oldItemData) {
                        addRecord(oldItemData);
                        // Restore the target cache entry removed optimistically above
                        seedTarget(id, oldItemData);
                    }
                    throw error;
                })
                .finally(() => loading && stopLoading(lk));
        });
    };

    return {
        // settings (default value could be necessary)
        createIdentifier,
        identifierKey,
        loadingKey,

        // TanStack QueryClient — exposed so consumers (and tests) can clear/unmount it
        queryClient: _queryClient,
        // Manual teardown for standalone usage (auto-called on scope dispose otherwise)
        destroy,

        // core structure
        itemDictionary,
        itemList,

        setRecords,
        resetRecords,
        resetAll,
        maxRecords,
        getRecord,
        getRecords,
        addRecord,
        addRecords,
        editRecord,
        deleteRecord,
        selectedIdentifier,
        selectedRecord,
        lastInsertedIdentifier,
        lastInsertedIdentifiers,
        lastInsertedRecord,

        // Pagination
        pageCurrent,
        pageSize,
        pageTotal,
        pageOffset,
        pageItemList,

        // belongsTo relationship
        parentHasMany,
        addToParent,
        removeFromParent,
        removeDuplicateChildren,
        getRecordsByParent,
        getListByParent,

        // api calls
        startLoading,
        stopLoading,
        loading,
        saveRecords,
        fetchAny,
        fetchAll,
        fetchByParent,
        fetchTarget,
        watchTarget,
        fetchMultiple,
        fetchPaginate,
        createTarget,
        updateTarget,
        deleteTarget,

        // pre-flight freshness checks
        checkTarget,
        checkAll,
        checkByParent,
        checkAny,
        checkPaginate,
        checkMultiple
    };
};
