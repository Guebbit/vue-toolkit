import { computed, ref } from 'vue';
import { QueryClient } from '@tanstack/query-core';
import { useStructureDataManagement } from '../index';

/**
 * Ideas:
 *  - Create a "check" method to know in advance if a fetch request will be denied and cache used
 */

/**
 * fetchSearch apiCall can return either a plain array or a tuple [items, total].
 * Both shapes are handled transparently — existing callers returning a plain array keep working.
 */
export type SearchApiResult<T> = (T | undefined)[] | [(T | undefined)[], number];

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
}

/**
 * Stringified query => page => array of ids of the found products
 */
export type ISearchCache<K = string | number> = Record<string, Record<number, K[]>>;

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
    loadingKey = crypto.randomUUID(),
    TTL = 3_600_000, // 1 hour
    delimiter = '|',
    getLoading,
    setLoading,
    queryClient: queryClientOption
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
     */
    // loading mutators
    const startLoading = (postfix = '') =>
        loadingKey && setLoading ? setLoading(loadingKey + postfix, true) : (_loading.value = true);
    const stopLoading = (postfix = '') =>
        loadingKey && setLoading
            ? setLoading(loadingKey + postfix, false)
            : (_loading.value = false);
    // Check if it's loading
    const _loading = ref(false);
    const loading = computed(() => (getLoading ? getLoading(loadingKey) : _loading.value));

    /**
     * TanStack QueryClient — sole cache, freshness and revalidation engine.
     * A new instance is created per composable unless an external one is provided.
     */
    const _queryClient: QueryClient =
        queryClientOption ??
        new QueryClient({
            defaultOptions: {
                queries: {
                    retry: false,
                    // Keep unused cache entries in memory for at least as long as the TTL
                    gcTime: Math.max(TTL, 5 * 60 * 1000),
                    // Never perform real network-status checks; always trust the queryFn result
                    networkMode: 'always'
                }
            }
        });

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
     * Common save items routine on various fetches
     *
     * @param items
     * @param merge
     * @param onSave - customized single item operations
     */
    function saveRecords(items: (T | undefined)[] = [], merge = false, onSave?: (item: T) => void) {
        for (let i = 0, len = items.length; i < len; i++) {
            if (!items[i]) continue;
            if (merge) editRecord(items[i]);
            else addRecord(items[i]!);
            if (onSave) onSave(items[i]!);
        }
        return items;
    }

    /**
     * Generic fetch for all types of requests.
     * Just for loading management and optional TanStack-backed caching.
     * When no lastUpdateKey is supplied the call is always executed without caching.
     *
     * @key F - type of the response, that can be anything
     * @param asyncCall  - call that we are going to make
     * @param forced
     * @param loading
     * @param lastUpdateKey
     * @param loadingKey
     * @param TTL - per-call staleTime override
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchAny = <F = any>(
        asyncCall: () => Promise<F>,
        {
            forced = false,
            loading = true,
            lastUpdateKey = '',
            loadingKey: lk,
            TTL: customTTL
        }: Omit<IFetchSettings, 'merge'> = {}
    ): Promise<F | undefined> => {
        // No cache key provided — always execute without TanStack caching
        if (!lastUpdateKey) {
            if (loading) startLoading(lk);
            return asyncCall().finally(() => loading && stopLoading(lk));
        }

        const staleTime = customTTL ?? TTL;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const queryKey: any[] = [loadingKey, 'any', lastUpdateKey];

        if (forced) _queryClient.removeQueries({ queryKey, exact: true });

        if (loading) startLoading(lk);

        return _queryClient
            .fetchQuery({ queryKey, queryFn: asyncCall, staleTime })
            .catch((error: unknown) => {
                _queryClient.removeQueries({ queryKey, exact: true });
                throw error;
            })
            .finally(() => loading && stopLoading(lk));
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
        const staleTime = customTTL ?? TTL;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const queryKey: any[] = [loadingKey, 'all', lastUpdateKey];

        // forced: remove cache entry so fetchQuery always re-fetches
        if (forced) _queryClient.removeQueries({ queryKey, exact: true });

        if (loading) startLoading(lk);

        return _queryClient
            .fetchQuery({ queryKey, queryFn: apiCall, staleTime })
            .then((items: (T | undefined)[] = []) =>
                saveRecords(items, merge, mismatch ? undefined : (item: T) => {
                    // Keep per-item target caches in sync
                    _queryClient.setQueryData([loadingKey, 'target', '', createIdentifier(item)], item);
                })
            )
            .catch((error: unknown) => {
                _queryClient.removeQueries({ queryKey, exact: true });
                throw error;
            })
            .finally(() => loading && stopLoading(lk));
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
        const staleTime = customTTL ?? TTL;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const queryKey: any[] = [loadingKey, 'parent', lastUpdateKey + String(parentId)];

        if (forced) _queryClient.removeQueries({ queryKey, exact: true });

        if (loading) startLoading(lk);

        return _queryClient
            .fetchQuery({ queryKey, queryFn: apiCall, staleTime })
            .then((items: (T | undefined)[] = []) => {
                for (let i = 0, len = items.length; i < len; i++) {
                    if (!items[i]) continue;
                    addToParent(parentId, createIdentifier(items[i]!) as string);

                    // if mismatch, we don't want to overwrite the fetchTarget's item so we merge
                    if (merge || mismatch) editRecord(items[i]);
                    else addRecord(items[i]!);

                    // Keep per-item target caches in sync unless mismatched partial data
                    if (!mismatch) {
                        _queryClient.setQueryData(
                            [loadingKey, 'target', '', createIdentifier(items[i]!)],
                            items[i]
                        );
                    }
                }
                removeDuplicateChildren(parentId);
                return items;
            })
            .catch((error: unknown) => {
                _queryClient.removeQueries({ queryKey, exact: true });
                throw error;
            })
            .finally(() => loading && stopLoading(lk));
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
        const staleTime = customTTL ?? TTL;

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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const queryKey: any[] = [loadingKey, 'target', lastUpdateKey, id];

        if (forced) _queryClient.removeQueries({ queryKey, exact: true });

        if (loading) startLoading(lk);

        // TanStack Query v5 disallows undefined as a queryFn return value.
        // Wrap: undefined → { data: undefined }, unwrap in .then()
        type WrappedTarget = { data: T | undefined };
        return _queryClient
            .fetchQuery<WrappedTarget>({
                queryKey,
                queryFn: () => apiCall().then(item => ({ data: item })),
                staleTime
            })
            .then(({ data: item }: WrappedTarget) => {
                if (!item) return;
                return saveRecords([item], merge)[0];
            })
            .catch((error: unknown) => {
                _queryClient.removeQueries({ queryKey, exact: true });
                throw error;
            })
            .finally(() => loading && stopLoading(lk));
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

        const staleTime = customTTL ?? TTL;

        const expiredIds: K[] = [];
        const cachedIds: K[] = [];

        // Check which ids are stale and need a network fetch
        for (const id of ids) {
            const targetKey = [loadingKey, 'target', lastUpdateKey, id];
            if (!forced && isQueryFresh(targetKey, staleTime)) cachedIds.push(id);
            else expiredIds.push(id);
        }

        // items that I already have
        const cachedItems = cachedIds.map((id) => getRecord(id));

        // If no ids are expired, no need to make a fetch
        if (expiredIds.length === 0) return Promise.resolve(cachedItems);

        if (loading) startLoading(lk);

        // request
        return apiCall()
            .then((items: (T | undefined)[] = []) => [
                ...saveRecords(items, merge, (item: T) => {
                    const id = createIdentifier(item);
                    _queryClient.setQueryData([loadingKey, 'target', lastUpdateKey, id], item);
                }),
                ...cachedItems
            ])
            .catch((error: unknown) => {
                // Remove failed entries so they can be retried
                for (const id of expiredIds)
                    _queryClient.removeQueries({
                        queryKey: [loadingKey, 'target', lastUpdateKey, id],
                        exact: true
                    });
                throw error;
            })
            .finally(() => loading && stopLoading(lk));
    };

    /**
     * Cached items ID divided per page, itemDictionary will hold the item data.
     * Stringified query => page => array of ids of the found products
     */
    const searchCached = ref<ISearchCache<K>>({});

    /**
     * Server-reported total count of matching items, keyed by cacheKey (same key as searchCached).
     * A value is only present when the apiCall returned the enriched { items, total } shape.
     */
    const searchTotals = ref<Record<string, number>>({});

    /**
     * Create a stable and always-the-same key from an object
     * @param object
     */
    // eslint-disable-next-line unicorn/consistent-function-scoping
    const searchKeyGen = (object: object = {}) =>
        JSON.stringify(object, Object.keys(object).toSorted());

    /**
     * Get search page based on key, pageSize and page number
     * @param key - stringified search parameters
     * @param page - page
     * @param pageSize - page size (must match the value used in fetchSearch)
     */
    const searchGet = (key: string | object, page = 1, pageSize = 10) => {
        const searchKey = typeof key === 'string' ? key : searchKeyGen(key);
        return getRecords(searchCached.value[searchKey + ':' + pageSize]?.[page]);
    };

    /**
     * Return the server-reported total for a given search, or undefined if never received.
     * Pass the same filters and pageSize used in fetchSearch.
     */
    const searchGetTotal = (key: string | object, pageSize = 10): number | undefined => {
        const searchKey = typeof key === 'string' ? key : searchKeyGen(key);
        return searchTotals.value[searchKey + ':' + pageSize];
    };

    /**
     * Manually set the total for a given search (e.g. when the total comes from a separate API call).
     * fetchSearch sets this automatically when apiCall returns the { items, total } shape.
     */
    const searchSetTotal = (key: string | object, total: number, pageSize = 10): void => {
        const searchKey = typeof key === 'string' ? key : searchKeyGen(key);
        searchTotals.value[searchKey + ':' + pageSize] = total;
    };

    /**
     * Prune searchCached and searchTotals entries that no longer have a
     * corresponding live entry in the TanStack query cache.
     * Keeps at most MAX_SEARCHES entries to bound memory usage.
     */
    const searchCleanup = () => {
        const MAX_SEARCHES = 50;

        const activeKeys: string[] = [];

        for (const cacheKey of Object.keys(searchCached.value)) {
            const pageMap = searchCached.value[cacheKey];
            let hasActivePage = false;
            for (const pageString of Object.keys(pageMap ?? {})) {
                const page = Number(pageString);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if (_queryClient.getQueryState([loadingKey, 'search', '', cacheKey, page] as any)
                        ?.dataUpdatedAt) {
                    hasActivePage = true;
                    break;
                }
            }
            if (hasActivePage) activeKeys.push(cacheKey);
            else {
                delete searchCached.value[cacheKey];
                delete searchTotals.value[cacheKey];
            }
        }

        // Enforce MAX_SEARCHES — prune excess active keys
        if (activeKeys.length > MAX_SEARCHES) {
            for (const cacheKey of activeKeys.slice(MAX_SEARCHES)) {
                delete searchCached.value[cacheKey];
                delete searchTotals.value[cacheKey];
            }
        }
    };

    /**
     * Fetch items as a search.
     * TanStack Query is used for per-(filters, page, pageSize) cache management.
     * The searchCached ref tracks which item ids belong to each page (for searchGet).
     *
     * Cache key structure: searchKey of filters + ":" + pageSize  (e.g. '{"q":"test"}:20')
     * Query key: [loadingKey, 'search', lastUpdateKey, cacheKey, page]
     *
     * We will cache the items like normal BUT the TTL will be checked on the stringified search parameters.
     * In searchCached we will store the search divided in pages, where every page contains an array of item ids.
     *
     * Cache key structure: searchKey of filters + ":" + pageSize  (e.g. '{"q":"test"}:20')
     * TTL key structure: lastUpdateKey + cacheKey + ":" + page
    /**
     * Fetch items as a search.
     * TanStack Query is used for per-(filters, page, pageSize) cache management.
     * The searchCached ref tracks which item ids belong to each page (for searchGet).
     *
     * Cache key structure: searchKey of filters + ":" + pageSize  (e.g. '{"q":"test"}:20')
     * Query key: [loadingKey, 'search', lastUpdateKey, cacheKey, page]
     *
     * @param apiCall
     * @param filters - search parameters
     * @param page - page number
     * @param pageSize - page size used for caching
     * @param forced
     * @param loading
     * @param merge
     * @param lastUpdateKey
     * @param loadingKey
     * @param mismatch
     * @param TTL - per-call staleTime override
     */
    const fetchSearch = <F = object>(
        apiCall: () => Promise<SearchApiResult<T>>,
        filters: F = {} as F,
        page = 1,
        // Could be set in the filters directly but it could be forgotten so it's better to say it explicitly
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
    ): Promise<(T | undefined)[]> => {
        const staleTime = customTTL ?? TTL;
        // cacheKey groups all pages for the same (filters, pageSize) combination
        const searchKey = searchKeyGen(filters as object) + ':' + pageSize;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const queryKey: any[] = [loadingKey, 'search', lastUpdateKey, searchKey, page];

        // Prune stale searchCached entries before each search
        searchCleanup();

        if (forced) _queryClient.removeQueries({ queryKey, exact: true });

        if (loading) startLoading(lk);

        return _queryClient
            .fetchQuery({ queryKey, queryFn: apiCall, staleTime })
            .then((result: SearchApiResult<T>) => {
                // Support both plain T[] and [T[], total] tuple shapes
                const isTuple = Array.isArray(result[0]);
                const items = (isTuple ? result[0] : result) as (T | undefined)[];
                if (isTuple)
                    searchSetTotal(
                        filters as object,
                        (result as [(T | undefined)[], number?])[1] ?? 0,
                        pageSize
                    );

                // Reset and repopulate the page-to-ids map
                if (!(searchKey in searchCached.value)) searchCached.value[searchKey] = [];
                searchCached.value[searchKey]![page] = [];

                saveRecords(items, merge, (item: T) => {
                    searchCached.value[searchKey]![page]!.push(createIdentifier(item));

                    if (!mismatch) {
                        _queryClient.setQueryData(
                            [loadingKey, 'target', '', createIdentifier(item)],
                            item
                        );
                    }
                });

                return items;
            })
            .catch((error: unknown) => {
                _queryClient.removeQueries({ queryKey, exact: true });
                throw error;
            })
            .finally(() => loading && stopLoading(lk));
    };

    /**
     * fetchAll with pagination.
     * It works exactly as a fetchSearch without filters
     *
     * @param apiCall
     * @param page
     * @param pageSize
     * @param settings
     */
    const fetchPaginate = <F = object>(
        apiCall: () => Promise<SearchApiResult<T>>,
        page = 1,
        pageSize = 10,
        settings: IFetchSettings = {}
    ) => fetchSearch(apiCall, {}, page, pageSize, settings);

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
            loadingKey: lk
        }: Omit<IFetchSettings, 'forced' | 'merge'> = {},
        fetchLike = true
    ): Promise<T | undefined> => {
        const temporaryId = crypto.randomUUID();
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
                if (fetchLike) {
                    _queryClient.setQueryData([loadingKey, 'target', lastUpdateKey, id], item);
                }
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
            loadingKey: lk
        }: Omit<IFetchSettings, 'forced'> = {},
        fetchLike = true,
        fetchAgain = true
    ): Promise<F | (T | undefined)[]> => {
        // to be used in case of error and revert is needed
        const oldItemData = getRecord(id);

        // for instantaneity, but can be inconsistent
        editRecord(itemData, id, true);

        if (loading) startLoading(lk);

        return (
            apiCall()
                // If the apiCall returns the updated item, editRecord will be called again to ensure data consistency
                .then((data) => {
                    if (fetchAgain) {
                        if (merge) editRecord(data as T, id);
                        else addRecord(data as T);
                    }

                    // Refresh per-item target cache
                    if (fetchLike || fetchAgain) {
                        const targetId = id ?? createIdentifier(data as T);
                        _queryClient.setQueryData(
                            [loadingKey, 'target', lastUpdateKey, targetId],
                            data
                        );
                    }

                    return data;
                })
                .catch((error: unknown) => {
                    // Rollback in case of error
                    if (oldItemData) editRecord(oldItemData, id);
                    throw error;
                })
                .finally(() => loading && stopLoading(lk))
        );
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
        deleteRecord(id);
        // Remove from TanStack cache optimistically
        _queryClient.removeQueries({ queryKey: [loadingKey, 'target', '', id], exact: true });
        if (loading) startLoading(lk);
        return apiCall()
            .catch((error: unknown) => {
                // Rollback in case of error
                if (oldItemData) {
                    addRecord(oldItemData);
                    _queryClient.setQueryData([loadingKey, 'target', '', id], oldItemData);
                }
                throw error;
            })
            .finally(() => loading && stopLoading(lk));
    };

    return {
        // settings (default value could be necessary)
        createIdentifier,
        identifierKey,
        loadingKey,

        // core structure
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
        fetchMultiple,
        searchCached,
        searchTotals,
        searchKeyGen,
        searchGet,
        searchGetTotal,
        searchSetTotal,
        searchCleanup,
        fetchSearch,
        fetchPaginate,
        createTarget,
        updateTarget,
        deleteTarget
    };
};
