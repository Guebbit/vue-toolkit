import {
    computed,
    ref,
    watch,
    type ComputedRef,
    type Ref,
    type WatchSource,
    type WatchStopHandle
} from 'vue';
import { stableNormalize } from '../utils/stableNormalize';
import {
    useStructureRestApi,
    type IFetchSettings,
    type IStructureRestApi
} from './structureRestApi';

/**
 * Page-cache for one search: page number => ids of the items that answered it.
 */
export type ISearchCache<K = string | number> = Record<string, Record<number, K[]>>;

/**
 * Settings accepted by `watchSearch`: `IFetchSettings` plus the watcher-specific
 * knob (immediate) and lifecycle callbacks (onSuccess/onError/onSettled).
 */
export interface IWatchSearchSettings<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends Record<string | number, any> = Record<string, any>,
    F = object
> extends IFetchSettings {
    immediate?: boolean;
    onSuccess?: (items: (T | undefined)[], filters: F) => void;
    onError?: (error: unknown, filters: F) => void;
    onSettled?: (items: (T | undefined)[] | undefined, error: unknown, filters: F) => void;
}

/**
 * Combines a search's cacheKey (filters + pageSize) with the caller's own
 * lastUpdateKey, if any, into the single lastUpdateKey dimension fetchPaginate
 * accepts. The result always starts with `searchKey` — searchCleanup depends on
 * that prefix to match every cached bucket of one search regardless of
 * lastUpdateKey.
 */
const combineKey = (searchKey: string, lastUpdateKey = ''): string =>
    lastUpdateKey ? searchKey + '|' + lastUpdateKey : searchKey;

/**
 * Reads the current value out of a WatchSource — a Ref, ComputedRef, or a plain
 * getter function — regardless of which one it is.
 */
const readWatchSource = <X>(source: WatchSource<X>): X =>
    typeof source === 'function' ? (source as () => X)() : (source as Ref<X>).value;

/**
 * Adds filtered search on top of an internally-owned useStructureRestApi() instance
 * — the same composition pattern useStructureRestApi itself uses on top of
 * useStructureDataManagement: `settings` is forwarded straight through as its options.
 *
 * Adds `fetchSearch`, `watchSearch`, `searchGet`, `checkSearch`, and the page-cache
 * bookkeeping (`searchCached`) behind them.
 *
 * `pageItemList` is overridden to be scoped to the CURRENT search's current page,
 * instead of a slice of the whole local item dictionary — otherwise its value would
 * silently drift once more than one search's items share the dictionary.
 *
 * The server-reported total (if any) is not this composable's concern: read it out
 * of your own apiCall response and keep it in your own state.
 *
 * `resetAll`/`destroy` are likewise overridden to also clear this composable's
 * own `searchCached`, so one call tears down everything.
 *
 * @param filtersSource  - Ref, ComputedRef, or getter producing the current search filters
 * @param settings       - options forwarded to the internally-created useStructureRestApi()
 */
export const useStructureSearchApi = <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends Record<string | number, any> = Record<string, any>,
    K extends string | number = Extract<keyof T, string | number>,
    P extends string | number = string | number,
    F = object
>(
    filtersSource: WatchSource<F>,
    settings: IStructureRestApi = {}
) => {
    const api = useStructureRestApi<T, K, P>(settings);

    /**
     * fetchSearch/checkSearch are built on top of these restApi primitives
     * instead of reimplementing them:
     *  - pageCurrent/pageSize: shared pagination state driving fetchSearch/watchSearch
     *  - createIdentifier: builds the id list stored per page in searchCached
     *  - getRecords: resolves searchCached's stored ids back into items for searchGet
     *  - fetchPaginate/checkPaginate: the fetch/freshness primitives fetchSearch
     *    and checkSearch key their filters into (see combineKey)
     *  - queryClient/loadingKey: let searchCleanup inspect the TanStack cache to
     *    tell which searches are still live
     */
    const {
        pageCurrent,
        pageSize,
        createIdentifier,
        getRecords,
        fetchPaginate,
        checkPaginate,
        queryClient,
        loadingKey
    } = api;

    /**
     * Cached item ids per page, keyed by (filters, pageSize). The item DATA lives
     * in restApi's item dictionary; this only tracks which ids answered which search.
     */
    const searchCached = ref<ISearchCache<K>>({});

    /**
     * Drops this composable's own search index (the page-to-ids map).
     * Leaves restApi's item dictionary/TanStack cache untouched — use the merged
     * `resetAll`/`destroy` below for a full reset.
     */
    const resetSearches = () => {
        searchCached.value = {};
    };

    /**
     * Create a stable and always-the-same key from an object.
     * Nested objects are supported: see stableNormalize.
     * @param object
     */
    // eslint-disable-next-line unicorn/consistent-function-scoping
    const searchKeyGen = (object: object = {}) => JSON.stringify(stableNormalize(object));

    /**
     * Get search page based on key, pageSize and page number
     * @param key - stringified search parameters
     * @param page - page
     * @param pageSize - page size (must match the value used in fetchSearch)
     */
    const searchGet = (key: string | object, page = 1, pageSize = 10): T[] => {
        const searchKey = typeof key === 'string' ? key : searchKeyGen(key);
        return getRecords(searchCached.value[searchKey + ':' + pageSize]?.[page]) ?? [];
    };

    /**
     * Prune searchCached entries that no longer have a corresponding live entry
     * in restApi's TanStack query cache. Keeps at most MAX_SEARCHES entries to
     * bound memory usage.
     */
    const searchCleanup = () => {
        // Upper bound on distinct (filters, pageSize) combinations kept around
        const MAX_SEARCHES = 50;

        // Every live 'paginate' query restApi currently holds — searches are
        // built on fetchPaginate, so this is where their cache entries live.
        const paginateQueries = queryClient
            .getQueryCache()
            .findAll({ queryKey: [loadingKey, 'paginate'] });

        // cacheKeys that still have at least one page backed by a live TanStack entry
        const activeKeys: string[] = [];

        for (const cacheKey of Object.keys(searchCached.value)) {
            // Live if ANY page under ANY caller lastUpdateKey is still cached. A query's
            // combinedKey (queryKey[2], see fetchPaginate/combineKey) is `cacheKey` itself
            // or `cacheKey + '|' + lastUpdateKey` — checking a single hardcoded
            // lastUpdateKey would prune searches that are very much alive.
            const hasActivePage = paginateQueries.some((query) => {
                const combinedKey = query.queryKey[2];
                return (
                    query.state.dataUpdatedAt &&
                    typeof combinedKey === 'string' &&
                    (combinedKey === cacheKey || combinedKey.startsWith(cacheKey + '|'))
                );
            });

            if (hasActivePage) activeKeys.push(cacheKey);
            else delete searchCached.value[cacheKey];
        }

        // Enforce MAX_SEARCHES — prune excess active keys
        if (activeKeys.length > MAX_SEARCHES) {
            for (const cacheKey of activeKeys.slice(MAX_SEARCHES))
                delete searchCached.value[cacheKey];
        }
    };

    /**
     * Fetches one page of a filtered search, built on top of restApi.fetchPaginate:
     * filters are turned into a stable key (searchKey of filters + ":" + pageSize,
     * e.g. '{"q":"test"}:20') and passed through as fetchPaginate's lastUpdateKey,
     * so each distinct filter set gets its own bucket of cached pages.
     *
     * apiCall resolves with plain items. If the server also reports a total, read
     * it out of your own apiCall response and keep it in your own state — this
     * composable has nothing to do with it.
     *
     * @param apiCall
     * @param filters - search parameters
     * @param page - page number
     * @param pageSize - page size used for caching
     * @param settings - forwarded to fetchPaginate (forced, loading, merge, mismatch, TTL, ...)
     */
    const fetchSearch = <FF = F>(
        apiCall: () => Promise<(T | undefined)[]>,
        filters: FF = {} as FF,
        page = 1,
        // Could be set in the filters directly but it could be forgotten so it's better to say it explicitly
        pageSize = 10,
        settings: IFetchSettings = {}
    ): Promise<(T | undefined)[]> => {
        // cacheKey groups all pages for the same (filters, pageSize) combination
        const searchKey = searchKeyGen(filters as object) + ':' + pageSize;

        // Prune stale searchCached entries before each search
        searchCleanup();

        return fetchPaginate(apiCall, page, pageSize, {
            ...settings,
            lastUpdateKey: combineKey(searchKey, settings.lastUpdateKey ?? '')
        }).then((items = []) => {
            // Reset and repopulate the page-to-ids map
            if (!(searchKey in searchCached.value)) searchCached.value[searchKey] = [];
            searchCached.value[searchKey]![page] = items
                .filter((item): item is T => item !== undefined)
                .map((item) => createIdentifier(item));

            return items;
        });
    };

    /**
     * Would fetchSearch(apiCall, filters, page, pageSize, settings) be served from cache?
     */
    const checkSearch = <FF = F>(
        filters: FF = {} as FF,
        page = 1,
        pageSize = 10,
        { lastUpdateKey = '', TTL }: Pick<IFetchSettings, 'lastUpdateKey' | 'TTL'> = {}
    ): boolean => {
        const searchKey = searchKeyGen(filters as object) + ':' + pageSize;
        return checkPaginate(page, pageSize, {
            lastUpdateKey: combineKey(searchKey, lastUpdateKey),
            TTL
        });
    };

    /**
     * fetchSearch's reactive counterpart: watches this composable's own
     * pageCurrent/pageSize and re-runs fetchSearch whenever either changes,
     * using whatever filters `searchFiltersSource` currently holds.
     *
     * Filters are READ, not watched: this composable has no opinion on when a filter
     * edit should trigger a search (as-you-type vs on-submit is a UI decision it
     * shouldn't make for you). A filter change only takes effect the next time
     * `search()` runs — via a pageCurrent/pageSize change, or your own call to the
     * returned `search()`. If you want as-you-type search, watch your filters
     * yourself (debounced, if desired) and call `search()` from that watcher.
     *
     * @param apiCall       - filters/page/pageSize-parametrized, since all three can change
     * @param searchFiltersSource - Ref, ComputedRef, or getter producing the current filters
     * @param immediate     - run once on creation, e.g. for the initial page load (default true)
     * @param onSuccess     - called with the fetched items after a successful search
     * @param onError       - called with the error after a failed search (otherwise swallowed,
     *                        same as an unhandled watch callback)
     * @param onSettled     - called after either outcome
     * @param settings      - forwarded to fetchSearch (forced, merge, TTL, ...)
     * @returns { stop, search } — stop the watcher, or trigger a search on demand
     *          (e.g. from a "reset page to 1 and search now" handler, where the
     *          page/pageSize watcher alone wouldn't fire because pageCurrent was
     *          already 1)
     */
    const watchSearch = <FF = F>(
        apiCall: (filters: FF, page: number, pageSize: number) => Promise<(T | undefined)[]>,
        searchFiltersSource: WatchSource<FF>,
        {
            immediate = true,
            onSuccess,
            onError,
            onSettled,
            ...settings
        }: IWatchSearchSettings<T, FF> = {}
    ): {
        stop: WatchStopHandle;
        search: (forced?: boolean) => Promise<(T | undefined)[] | undefined>;
    } => {
        const search = (forced = false) => {
            const filters = readWatchSource(searchFiltersSource);
            return fetchSearch(
                () => apiCall(filters, pageCurrent.value, pageSize.value),
                filters,
                pageCurrent.value,
                pageSize.value,
                { ...settings, forced: forced || settings.forced }
            )
                .then((items) => {
                    onSuccess?.(items, filters);
                    onSettled?.(items, undefined, filters);
                    return items;
                })
                .catch((error: unknown): undefined => {
                    onError?.(error, filters);
                    onSettled?.(undefined, error, filters);
                });
        };

        const stop = watch([pageCurrent, pageSize], () => void search(), { immediate });

        return { stop, search };
    };

    /**
     * Items on the CURRENT search's current page: `searchGet(filters, pageCurrent, pageSize)`.
     */
    const pageItemList: ComputedRef<T[]> = computed(() =>
        searchGet(readWatchSource(filtersSource) as object, pageCurrent.value, pageSize.value)
    );

    /**
     * Would `fetchSearch` for the current filters/pageCurrent/pageSize be
     * served from cache right now?
     */
    const isPageCached = (settings?: Pick<IFetchSettings, 'lastUpdateKey' | 'TTL'>): boolean =>
        checkSearch(
            readWatchSource(filtersSource) as object,
            pageCurrent.value,
            pageSize.value,
            settings
        );

    /**
     * Same as `isPageCached`, but checks `fetchPaginate` (no filters) instead of `fetchSearch`.
     */
    const isPaginateCached = (settings?: Pick<IFetchSettings, 'lastUpdateKey' | 'TTL'>): boolean =>
        checkPaginate(pageCurrent.value, pageSize.value, settings);

    /**
     * `watchSearch`, pre-bound to this composable's own filtersSource so callers
     * don't have to pass it (and can't accidentally pass a different one than
     * `pageItemList` above is reading).
     */
    const watchCurrentSearch = (
        apiCall: (filters: F, page: number, pageSize: number) => Promise<(T | undefined)[]>,
        settings?: IWatchSearchSettings<T, F>
    ) => watchSearch<F>(apiCall, filtersSource, settings);

    /**
     * restApi.resetAll(), plus this composable's own search indexes: a single
     * call resets both halves of the combined store.
     */
    const resetAll = () => {
        api.resetAll();
        resetSearches();
    };

    /**
     * restApi.destroy(), plus this composable's own search indexes: a single
     * call tears down both halves of the combined store.
     * @param forced - see restApi.destroy
     */
    const destroy = (forced?: boolean) => {
        api.destroy(forced);
        resetSearches();
    };

    return {
        ...api,

        pageItemList,
        resetAll,
        destroy,

        searchCached,
        searchKeyGen,
        searchGet,
        searchCleanup,
        resetSearches,
        fetchSearch,
        checkSearch,

        isPageCached,
        isPaginateCached,
        watchSearch: watchCurrentSearch
    };
};
