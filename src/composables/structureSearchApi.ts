/**
 * Filtered, server-paginated search on top of a REST resource.
 *
 * A search is its own cache kind, `[resourceKey, 'search', dependsOn, filters, pageSize, page,
 * ...key]`, each page entry holding its ids and the server's `totalItems`. What the screen shows
 * follows the *applied* search — a detached copy of the filters (and key), taken when a search
 * runs — never the live filters, so a form bound to them does not move the list while the user
 * types.
 *
 * @module composables/structureSearchApi
 * @see docs/composables/structure-search-api.md
 */
import { computed, ref, shallowRef, toValue, watch, type ComputedRef, type WatchSource } from 'vue';
import type { Query } from '@tanstack/vue-query';
import { createRestResource } from '../internal/restResource.js';
import { detachedCopy, stableKey } from '../internal/plainData.js';
import type { IListCacheEntry } from '../internal/resourceKeys.js';
import { watchSettled } from '../internal/settleCallbacks.js';
import type { TIdOf } from './structureDataManagement.js';
import type {
    IFetchContext,
    IFetchSettings,
    IStructureRestApi,
    IStructureRestApiOptions,
    ITanStackQueryOptions,
    IWatchCallbacks,
    IWatchHandle
} from './structureRestApi.js';

/** What a search resolves: one page of items, and the server's total for the whole search. */
export interface ISearchResult<T> {
    /** The page's items. */
    items: (T | undefined)[];

    /** How many items the whole search matches, across every page. */
    totalItems: number;
}

/**
 * The context {@link IStructureSearchApi.fetchSearch}'s `apiCall` receives, as its last
 * parameter: {@link IFetchContext} plus a FROZEN copy of the search this fetch belongs to. TanStack
 * re-runs the last `apiCall` it was given on an unrelated invalidation (`invalidateQueries`, a
 * mutation's own invalidation) — reading `filters`/`page`/`pageSize` from here instead of from
 * live reactive state means that re-run asks the same question again, not whatever is in the form
 * right now. An `apiCall` typed `(context: IFetchContext) => …` still compiles unchanged: it only
 * has to ignore the extra fields.
 */
export interface ISearchFetchContext<F> extends IFetchContext {
    /** The filters this fetch was asked for — a detached copy, immutable. */
    filters: F;

    /** The page this fetch was asked for. */
    page: number;

    /** The page size this fetch was asked for. */
    pageSize: number;
}

/** watchSearch's settings: the fetch settings, `immediate`, and the settle callbacks. */
export interface IWatchSearchSettings<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string | number, any> = Record<string, any>,
    F = object
>
    extends IFetchSettings, IWatchCallbacks<(T | undefined)[], F> {
    /** Search right away with the current filters (default true); otherwise wait for `search()`. */
    immediate?: boolean;

    /** TanStack `useQuery` options for this call; overrides the resource's own default. */
    queryOptions?: ITanStackQueryOptions;
}

/** What watchSearch returns: a watcher handle, plus `search()`. */
export interface IWatchSearchHandle<T> extends IWatchHandle<ISearchResult<T> | undefined> {
    /**
     * Applies the live filters and fetches the current page. Resolves undefined on failure: the
     * failure shows in `error` and `onError`. `forced` forces this one search; on a watcher
     * created with `forced`, every search is forced whatever is passed here.
     */
    search: (forced?: boolean) => Promise<ISearchResult<T> | undefined>;
}

/** A search page's cache entry: its ids, and the total it was reported with. */
interface ISearchCacheEntry<K> extends IListCacheEntry<K> {
    /** The server's total for the whole search. */
    totalItems: number;
}

/** The search behind what is on screen. */
interface IAppliedSearch<F> {
    /** Detached copy of the filters it ran with. */
    filters: F;

    /** Its bucket key, if any. */
    key?: string[];
}

/**
 * The last entry actually shown on screen, kept as a placeholder across ANY change (page, size or
 * filters) while the next one loads — see `shownEntry`. Tagged with the scope it was shown under
 * (`dependsOn` plus the reset generation), so a `dependsOn` change or a `resetAll()` starts the
 * placeholder over instead of leaking a previous scope's rows onto a new one.
 */
interface IShownEntry<K> {
    /** The scope this was shown under — see `placeholderScope`. */
    scope: string;

    /** The entry itself. */
    entry: ISearchCacheEntry<K>;
}

/**
 * Resolves a watcher's fetch into its result: the current page, or undefined when it failed.
 *
 * @param failed - whether the fetch failed
 * @param current - reads the current page
 * @returns the result
 */
const settledResult = <R>(failed: boolean, current: () => R): R | undefined =>
    failed ? undefined : current();

/**
 * What {@link useStructureSearchApi} returns, as an explicit interface (not inferred). Everything
 * `useStructureRestApi` returns is passed through; `pageItemList` and `pageTotal` are redefined to
 * follow the applied search instead of client-side pagination over the whole dictionary.
 */
export interface IStructureSearchApi<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string | number, any> = Record<string, any>,
    K extends string | number = TIdOf<T>,
    P extends string | number = string | number,
    F = object
> extends Omit<IStructureRestApi<T, K, P>, 'pageTotal' | 'pageItemList'> {
    /** Page count of the applied search. */
    pageTotal: ComputedRef<number>;

    /**
     * Items of the applied search's current page. Keeps the most recently cached page's items
     * while the current page/size/filters combination has not landed yet, instead of dropping to
     * `[]` — see `isPlaceholder` to tell a placeholder apart from the real current page.
     */
    pageItemList: ComputedRef<T[]>;

    /**
     * True while `pageItemList` is showing a placeholder (a previously cached page, kept on
     * screen because the current page has not landed yet), so a caller can dim the list or skip
     * an empty-state message instead of treating it as the real current page.
     */
    isPlaceholder: ComputedRef<boolean>;

    /** The applied search's server-reported total, across every page. */
    totalItems: ComputedRef<number>;

    /** A cached search page, by filters, without fetching. */
    searchGet: (
        filters: string | object,
        page?: number,
        size?: number,
        settings?: Pick<IFetchSettings, 'key'>
    ) => T[];

    /** Fetches one page of a filtered search and makes it the applied search. */
    fetchSearch: <FF = F>(
        apiCall: (context: ISearchFetchContext<FF>) => Promise<ISearchResult<T>>,
        filters?: FF,
        page?: number,
        size?: number,
        settings?: IFetchSettings
    ) => Promise<ISearchResult<T>>;

    /** Would `fetchSearch` be served from cache? */
    checkSearch: <FF = F>(
        filters?: FF,
        page?: number,
        size?: number,
        settings?: Pick<IFetchSettings, 'key' | 'staleTime'>
    ) => boolean;

    /** `checkSearch` for the live filters and the current page/pageSize. */
    isPageCached: (settings?: Pick<IFetchSettings, 'key' | 'staleTime'>) => boolean;

    /** Same as `isPageCached`, for `fetchPaginate` (no filters). */
    isPaginateCached: (settings?: Pick<IFetchSettings, 'key' | 'staleTime'>) => boolean;

    /** The active search: keeps the applied search's current page fetched. */
    watchSearch: (
        apiCall: (
            filters: F,
            page: number,
            pageSize: number,
            context: IFetchContext
        ) => Promise<ISearchResult<T>>,
        settings?: IWatchSearchSettings<T, F>
    ) => IWatchSearchHandle<T>;
}

/**
 * A REST resource plus filtered, server-paginated search. Everything `useStructureRestApi`
 * returns is passed through; `pageItemList`, `pageTotal` and `totalItems` follow the applied
 * search.
 *
 * @param filtersSource - Ref, ComputedRef or getter producing the live filters
 * @param settings - the resource's options (see IStructureRestApiOptions)
 * @returns the resource, with search
 */
export const useStructureSearchApi = <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string | number, any> = Record<string, any>,
    K extends string | number = TIdOf<T>,
    P extends string | number = string | number,
    F = object
>(
    filtersSource: WatchSource<F>,
    settings: IStructureRestApiOptions
): IStructureSearchApi<T, K, P, F> => {
    /** The resource, and the machinery its lists run on. */
    const { api, engine } = createRestResource<T, K, P>(settings);

    /** Shared pagination state and the record reader. */
    const { pageCurrent, pageSize, getRecords, checkPaginate } = api;

    /** Cache access, from the resource. */
    const { queryClient, keys, dependsOn } = engine;

    /** Moves when a search page gets new data or leaves the cache. */
    const searchVersion = engine.version('search');

    /**
     * A search page's query key.
     *
     * @param filters - the filters, or their stableKey string
     * @param size - page size
     * @param page - page number
     * @param key - the bucket key
     * @returns the query key
     */
    const searchQueryKey = (
        filters: object | string,
        size: number,
        page: number,
        key?: string[]
    ): unknown[] =>
        keys.entry(
            'search',
            dependsOn(),
            [typeof filters === 'string' ? filters : stableKey(filters), size, page],
            key
        );

    /** The applied search; undefined until one runs. */
    const applied = shallowRef<IAppliedSearch<F>>();

    /**
     * Makes `filters` the applied search, as a detached copy: later edits to the source never
     * reach it. An equal search is left in place.
     *
     * @param filters - the filters to apply
     * @param key - the bucket key
     * @returns the applied filters
     */
    const applySearch = (filters: F, key?: string[]): F => {
        const next = { filters: detachedCopy(filters), key };
        if (applied.value && stableKey(applied.value) === stableKey(next))
            return applied.value.filters;
        applied.value = next;
        return next.filters;
    };

    /** The applied search's current page's query key — filters, size and page all folded in. */
    const currentSearchQueryKey = computed<unknown[] | undefined>(() => {
        const search = applied.value;
        if (!search) return;
        return searchQueryKey(
            search.filters as object,
            pageSize.value,
            pageCurrent.value,
            search.key
        );
    });

    /** The applied search's entry for the current page. */
    const currentSearchEntry = computed<ISearchCacheEntry<K> | undefined>(() => {
        void searchVersion.value;
        const queryKey = currentSearchQueryKey.value;
        if (!queryKey) return;
        return queryClient.getQueryData<ISearchCacheEntry<K>>(queryKey);
    });

    /**
     * Predicate: a cached page (any page, any size) of the given search.
     *
     * @param search - the search
     * @returns the predicate
     */
    const isPageOf = (search: IAppliedSearch<F>) => {
        const inCurrent = keys.inScope(dependsOn(), ['search']);
        const filtersKey = stableKey(search.filters as object);
        return (query: Query): boolean => {
            if (!inCurrent(query) || query.queryKey[3] !== filtersKey) return false;
            const [size, page] = query.queryKey.slice(4, 6);
            const expected = searchQueryKey(filtersKey, size as number, page as number, search.key);
            return (
                query.state.data !== undefined && stableKey(query.queryKey) === stableKey(expected)
            );
        };
    };

    /**
     * The applied search's most recently updated cached page, of ANY page/size — not necessarily
     * the current one. Backs both `totalItems`'s fallback (the total does not depend on the page)
     * and `pageItemList`'s placeholder fallback (keep showing something while the next page loads).
     */
    const latestKnownEntry = computed<ISearchCacheEntry<K> | undefined>(() => {
        void searchVersion.value;
        if (!applied.value) return;
        // Single-pass max, not .toSorted(...)[0]: toSorted needs Safari 16+ (2022), and every
        // caller here only wants the single freshest page anyway.
        let latest: Query | undefined;
        for (const query of queryClient
            .getQueryCache()
            .findAll({ predicate: isPageOf(applied.value) }))
            if (!latest || query.state.dataUpdatedAt > latest.state.dataUpdatedAt) latest = query;
        return latest?.state.data as ISearchCacheEntry<K> | undefined;
    });

    /**
     * Bumped by `resetAll()` (see below) to start `shownEntry`'s placeholder over even when
     * `dependsOn` itself did not change — a plain cache wipe on the SAME scope, which otherwise
     * looks identical to `shownEntry` and would keep leaking the wiped rows onto the screen.
     */
    const resetGeneration = ref(0);

    /**
     * The scope a shown entry is tagged with: `dependsOn` plus the reset generation, folded into
     * one string. Two entries tagged with a different one must never be shown as if they were the
     * same search — see `IShownEntry`.
     */
    const placeholderScope = (): string => stableKey([dependsOn(), resetGeneration.value]);

    /**
     * The query key behind the last `currentSearchEntry` actually seen — a key, not the entry
     * itself, so `shownEntry` below can tell "superseded by a different applied search, but still
     * sitting in the cache" (show it) apart from "gone from the cache outright" (a `maxRecords`
     * wipe: do not go on reporting a total the resource no longer has). Remembered EAGERLY by a
     * watcher, not merely whatever `pageItemList` happened to be read while it was current, so the
     * placeholder survives even when nothing read it in between. `sync` flush: updated in the same
     * tick `currentSearchEntry` changes, so a synchronous read right after a key change (no
     * `await` in between) sees the same thing a `flush: 'pre'`/next-render read would.
     */
    const lastShownKey = shallowRef<{ scope: string; queryKey: unknown[] }>();
    watch(
        currentSearchEntry,
        (entry) => {
            if (entry)
                lastShownKey.value = {
                    scope: placeholderScope(),
                    queryKey: currentSearchQueryKey.value!
                };
        },
        { immediate: true, flush: 'sync' }
    );

    /**
     * The entry `pageItemList`/`isPlaceholder`/`totalItems`'s placeholder fallback shows: the
     * current page when cached, else whatever was shown a moment ago and is STILL in the cache
     * (any page, size OR filters — TanStack's own `keepPreviousData` idea, via `lastShownKey`),
     * else any cached page of the applied search. `lastShownKey`'s scope tag keeps a `dependsOn`
     * change or a `resetAll()` from leaking a previous scope's rows onto a new one; re-reading it
     * through the cache (not the remembered entry) keeps a `maxRecords` wipe from doing the same.
     */
    const shownEntry = computed<IShownEntry<K> | undefined>(() => {
        void searchVersion.value;
        let remembered: ISearchCacheEntry<K> | undefined;
        if (lastShownKey.value?.scope === placeholderScope())
            remembered = queryClient.getQueryData<ISearchCacheEntry<K>>(
                lastShownKey.value.queryKey
            );
        const entry = currentSearchEntry.value ?? remembered ?? latestKnownEntry.value;
        return entry ? { scope: placeholderScope(), entry } : undefined;
    });

    /**
     * "124 orders": the applied search's server-reported total. Falls back to `shownEntry` (not
     * just `latestKnownEntry`) so the total does not blip to 0 when new, never-fetched filters are
     * applied while the previous search's placeholder is still on screen.
     */
    const totalItems = computed<number>(
        () =>
            currentSearchEntry.value?.totalItems ??
            latestKnownEntry.value?.totalItems ??
            shownEntry.value?.entry.totalItems ??
            0
    );

    /** Page count of the applied search. */
    const pageTotal = computed<number>(() => Math.ceil(totalItems.value / pageSize.value));

    /**
     * Items of the applied search's current page. While the current page has not landed yet (a
     * page, size OR filters change, mid-fetch), keeps showing whatever was shown a moment ago
     * instead of dropping to `[]` — see `isPlaceholder` to tell the two apart.
     */
    const pageItemList = computed<T[]>(() =>
        getRecords(currentSearchEntry.value?.ids ?? shownEntry.value?.entry.ids ?? [])
    );

    /**
     * True while `pageItemList` is showing a placeholder — something shown a moment ago, kept on
     * screen because the current page/size/filters combination has not landed yet. `false` once
     * the current page is cached (including an empty one), and `false` on a genuinely empty first
     * load (nothing shown yet to fall back on).
     */
    const isPlaceholder = computed<boolean>(
        () => currentSearchEntry.value === undefined && shownEntry.value !== undefined
    );

    /** The applied search's current page, as a search result. */
    const currentResult = (): ISearchResult<T> => ({
        items: pageItemList.value,
        totalItems: totalItems.value
    });

    /**
     * A cached search page, by filters.
     *
     * @param filters - the filters, or their stableKey string
     * @param page - page number
     * @param size - page size (as used when fetching)
     * @param settings - key
     * @returns the page's items
     */
    const searchGet = (
        filters: string | object,
        page = 1,
        size = 10,
        { key }: Pick<IFetchSettings, 'key'> = {}
    ): T[] =>
        getRecords(
            queryClient.getQueryData<ISearchCacheEntry<K>>(searchQueryKey(filters, size, page, key))
                ?.ids ?? []
        );

    /**
     * Adapts a search call to the list protocol: its items become the list, and its total rides
     * along in the cache entry. Builds the {@link ISearchFetchContext} `apiCall` receives from
     * `filters`/`page`/`size` FROZEN at the call site — not read off `running.meta` or live
     * state — so a later re-run of this same closure (TanStack re-running the last `queryFn` it
     * was given, on an unrelated invalidation) asks the same question again.
     *
     * @param apiCall - resolves one search page
     * @param filters - the search this call belongs to, frozen
     * @param page - the page this call belongs to
     * @param size - the page size this call belongs to
     * @returns the list call, and the extra data to store with its ids
     */
    const asListCall = <FF>(
        apiCall: (context: ISearchFetchContext<FF>) => Promise<ISearchResult<T>>,
        filters: FF,
        page: number,
        size: number
    ) => {
        let reported = 0;
        return {
            call: (context: IFetchContext) =>
                apiCall({
                    // Kept a lazy getter, same reason as IFetchContext's own: reading it up front
                    // would change how TanStack cancels a fetch whose watcher unmounts.
                    get signal() {
                        return context.signal;
                    },
                    filters,
                    page,
                    pageSize: size
                }).then(({ items, totalItems: total }) => {
                    reported = total;
                    return items;
                }),
            extra: () => ({ totalItems: reported })
        };
    };

    /**
     * Fetches one page of a filtered search and makes it the applied search. apiCall resolves
     * `{ items, totalItems }`. Also applies `page`/`size` to `pageCurrent`/`pageSize`, so
     * `pageItemList` shows the very page this call fetched, not whatever page was current before.
     *
     * @param apiCall - resolves the page
     * @param filters - the search filters
     * @param page - page number
     * @param size - page size, part of the cache key
     * @param settings - forced / merge / partial / staleTime / key
     * @returns the page, with the search's total
     */
    const fetchSearch = <FF = F>(
        apiCall: (context: ISearchFetchContext<FF>) => Promise<ISearchResult<T>>,
        filters: FF = {} as FF,
        page = 1,
        size = 10,
        settings: IFetchSettings = {}
    ): Promise<ISearchResult<T>> => {
        const snapshot = applySearch(filters as unknown as F, settings.key) as object;
        // Built ONCE, from the scope at this exact moment: searchQueryKey reads dependsOn()
        // internally, so a second call later — after a dependsOn change this fetch was cut short
        // by — would silently rebuild it under the NEW scope and read (or miss) a sibling
        // instance's entry instead of this call's own (see A4).
        const pageKey = searchQueryKey(snapshot, size, page, settings.key);
        // Both set synchronously, size before page: pageSize's own watcher (flush: 'sync') resets
        // pageCurrent to 1 the instant pageSize changes — landing before vue-query's own (pre-flush)
        // key watcher can react to either — so the explicit page assigned right after is what
        // sticks, not the reset's page 1. No nextTick, no frame showing a stale page in between.
        pageSize.value = size;
        pageCurrent.value = page;
        const { call, extra } = asListCall(apiCall, snapshot as unknown as FF, page, size);
        return engine.runListQuery(pageKey, call, settings, extra).then((items) => ({
            items,
            // A cache hit never ran the call: read the total from the entry itself, off the SAME
            // key the fetch above ran under.
            totalItems: queryClient.getQueryData<ISearchCacheEntry<K>>(pageKey)?.totalItems ?? 0
        }));
    };

    /**
     * Would fetchSearch be served from cache?
     *
     * @param filters - the search filters
     * @param page - page number
     * @param size - page size
     * @param settings - key / staleTime
     * @returns whether it would
     */
    const checkSearch = <FF = F>(
        filters: FF = {} as FF,
        page = 1,
        size = 10,
        { key, staleTime }: Pick<IFetchSettings, 'key' | 'staleTime'> = {}
    ): boolean => engine.isFresh(searchQueryKey(filters as object, size, page, key), staleTime);

    /**
     * Would fetchSearch, for the live filters and the current page, be served from cache?
     *
     * @param settings - key / staleTime
     * @returns whether it would
     */
    const isPageCached = (settings?: Pick<IFetchSettings, 'key' | 'staleTime'>): boolean =>
        checkSearch(toValue(filtersSource) as object, pageCurrent.value, pageSize.value, settings);

    /**
     * Same as isPageCached, for fetchPaginate (no filters).
     *
     * @param settings - key / staleTime
     * @returns whether it would
     */
    const isPaginateCached = (settings?: Pick<IFetchSettings, 'key' | 'staleTime'>): boolean =>
        checkPaginate(pageCurrent.value, pageSize.value, settings);

    /**
     * The active search: keeps the applied search's current page fetched, re-running on a page
     * or page-size change, on invalidation and on a `dependsOn` change. Filters are read, never
     * watched: an edit takes effect at the next `search()` (as-you-type search is the caller's
     * choice: watch the filters and call `search()`). Each fetch sends the filters, page and page
     * size its own query was built from.
     *
     * @param apiCall - resolves one page for the given filters, page and page size
     * @param settings - immediate, the fetch settings, and the settle callbacks
     * @returns the watcher handle, plus `search()`
     */
    const watchSearch = (
        apiCall: (
            filters: F,
            page: number,
            pageSize: number,
            context: IFetchContext
        ) => Promise<ISearchResult<T>>,
        {
            immediate = true,
            onSuccess,
            onError,
            onSettled,
            ...searchSettings
        }: IWatchSearchSettings<T, F> = {}
    ): IWatchSearchHandle<T> => {
        /** False until the first search when not immediate: the query stays disabled. */
        const hasStarted = ref(immediate);
        if (immediate && !applied.value) applySearch(toValue(filtersSource), searchSettings.key);

        /** The applied search, or an empty one before any has run. */
        const current = (): IAppliedSearch<F> =>
            applied.value ?? { filters: {} as F, key: searchSettings.key };

        /** The current page's key under the applied search. */
        const queryKey = (): unknown[] =>
            searchQueryKey(
                current().filters as object,
                pageSize.value,
                pageCurrent.value,
                current().key
            );

        const { query, scope, refetch, suspense } = engine.watchQuery<ISearchCacheEntry<K>>({
            queryKey,
            meta: () => ({
                filters: current().filters,
                page: pageCurrent.value,
                size: pageSize.value
            }),
            fetch: (running) => {
                const { filters, page, size } = running.meta as {
                    filters: F;
                    page: number;
                    size: number;
                };
                const { call, extra } = asListCall(
                    (context) => apiCall(filters, page, size, context),
                    filters,
                    page,
                    size
                );
                return engine.listQueryFunction(call, searchSettings, running, extra) as Promise<
                    ISearchCacheEntry<K>
                >;
            },
            enabled: hasStarted,
            forced: searchSettings.forced,
            staleTime: searchSettings.staleTime,
            key: () => current().key,
            queryOptions: searchSettings.queryOptions
        });

        /**
         * True when the current page is cached and fresh. A forced watcher never is: `forced`
         * here can only add to the watcher's own setting, never lift it.
         *
         * @param forced - count nothing as fresh, for this one check
         * @returns whether it is
         */
        const isCurrentFresh = (forced = false) =>
            engine.isFresh(
                queryKey(),
                engine.staleTimeOf({ ...searchSettings, forced: forced || searchSettings.forced })
            );

        const { settleIfUnchanged } = scope.run(() =>
            watchSettled(
                queryClient,
                {
                    queryKey,
                    isFresh: () => hasStarted.value && isCurrentFresh(),
                    result: () => pageItemList.value,
                    context: () => current().filters
                },
                { onSuccess, onError, onSettled }
            )
        )!;

        /**
         * Applies the live filters and fetches the current page (see IWatchSearchHandle).
         *
         * @param forced - ask the server even if the page is cached and fresh
         * @returns the page, or undefined on failure
         */
        const search = (forced = false): Promise<ISearchResult<T> | undefined> => {
            hasStarted.value = true;
            applySearch(toValue(filtersSource), searchSettings.key);
            if (isCurrentFresh(forced)) {
                // A switch to fresh data settles through the key watcher; staying on it, here.
                settleIfUnchanged();
                return Promise.resolve(currentResult());
            }
            // refetch() first moves the query to the applied search's key, then fetches it.
            return refetch().then((result) => settledResult(result.isError, currentResult));
        };

        return {
            stop: () => scope.stop(),
            // Before any search there is nothing shown, so nothing to fetch again.
            refetch: () =>
                applied.value ? refetch().then(currentResult) : Promise.resolve(currentResult()),
            suspense: () =>
                applied.value ? suspense().then(currentResult) : Promise.resolve(currentResult()),
            error: query.error,
            search
        };
    };

    // A page number from the old page size rarely means anything under the new one.
    // Vue: `sync` flush, not the default `pre` — vue-query's own key watcher (built inside
    // watchSearch/watchList) is also `pre`, and a `pre` watcher created with no current component
    // can run before this one (see structure-search-api.md). `sync` guarantees the reset always
    // lands before ANY `pre` watcher sees the new pageSize, so a query never fetches an out-of-
    // range page at the new size before landing on page 1.
    watch(
        pageSize,
        () => {
            pageCurrent.value = 1;
        },
        { flush: 'sync' }
    );

    /**
     * `resetAll`, wrapped: bumps `resetGeneration` first, so `shownEntry`'s placeholder never
     * survives a full cache wipe on the SAME scope (the cross-user/cross-search leak class this
     * composable otherwise guards against).
     */
    const resetAll = (): void => {
        resetGeneration.value++;
        api.resetAll();
    };

    return {
        ...api,

        pageTotal,
        pageItemList,
        isPlaceholder,
        totalItems,
        resetAll,

        searchGet,
        fetchSearch,
        checkSearch,
        isPageCached,
        isPaginateCached,
        watchSearch
    };
};
