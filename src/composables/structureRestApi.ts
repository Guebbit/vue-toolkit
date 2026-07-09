import { computed, getCurrentScope, onScopeDispose, reactive, ref, toRaw } from 'vue';
import { QueryClient } from '@tanstack/query-core';
// vue-query's QueryClient subclasses the core one; we instantiate it (Vue-integrated
// foundation for future reactive layers) but keep the core type for the external param
// so either a core or a vue-query client can be injected.
import { QueryClient as VueQueryClient } from '@tanstack/vue-query';
import { generateFallbackValue, useStructureDataManagement } from '../index';

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
 * Recursively rebuild a value with every object's keys in sorted order, so that
 * JSON.stringify of the result is a stable cache key regardless of key insertion order.
 *
 * Do NOT go back to `JSON.stringify(obj, Object.keys(obj).toSorted())`: an array replacer
 * is an allow-list applied at EVERY depth, so it silently strips nested keys and makes
 * {sort:{by:'a'}} and {sort:{by:'b'}} collide on the same key.
 *
 * Conventions:
 *  - arrays keep their order (order is meaningful in a filter, e.g. sort priority)
 *  - `undefined` values are dropped, so {a: undefined} and {} share a key (an unset
 *    filter and an absent filter mean the same thing)
 *  - Date becomes its ISO string (JSON.stringify would do it anyway, done here for clarity)
 */
export const stableNormalize = (value: unknown): unknown => {
    if (!value || typeof value !== 'object') return value;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map((item) => stableNormalize(item));
    const source = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(source).toSorted())
        if (source[key] !== undefined) normalized[key] = stableNormalize(source[key]);
    return normalized;
};

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
     * (searchCached applies the same idea from the other end: it is capped at
     * MAX_SEARCHES = 50 buckets rather than expired by age.)
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
        new VueQueryClient({
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
     * forbids caching a bare `undefined`). Every producer — fetchAll/fetchSearch/
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

        // Namespaced by loadingKey + lastUpdateKey so unrelated fetchAny calls don't share a cache slot
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const queryKey: any[] = [loadingKey, 'any', lastUpdateKey];

        // forced: drop the existing entry first so fetchQuery can't treat it as still fresh
        if (forced) _queryClient.removeQueries({ queryKey, exact: true });

        if (loading) startLoading(lk);

        return (
            _queryClient
                // fetchQuery returns the cached value if it's within staleTime, otherwise
                // it awaits asyncCall(), caches the resolved value under queryKey and returns it
                .fetchQuery({ queryKey, queryFn: asyncCall, staleTime: customTTL ?? TTL })
                .catch((error: unknown) => {
                    _queryClient.removeQueries({ queryKey, exact: true });
                    throw error;
                })
                .finally(() => loading && stopLoading(lk))
        );
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const queryKey: any[] = [loadingKey, 'all', lastUpdateKey];

        // forced: remove cache entry so fetchQuery always re-fetches
        if (forced) _queryClient.removeQueries({ queryKey, exact: true });

        if (loading) startLoading(lk);

        // Skips apiCall entirely if queryKey is still within staleTime, returning the cached list instead
        return _queryClient
            .fetchQuery({ queryKey, queryFn: apiCall, staleTime: customTTL ?? TTL })
            .then((items: (T | undefined)[] = []) =>
                // Store each fetched item locally; also seed its own "target" query
                // cache entry so a later fetchTarget(id) call sees it as fresh —
                // unless mismatch, since these items may carry only partial fields
                saveRecords(
                    items,
                    merge,
                    mismatch ? undefined : (item: T) => seedTarget(createIdentifier(item), item)
                )
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
        // parentId is folded into the key so each parent gets its own cache slot
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const queryKey: any[] = [loadingKey, 'parent', lastUpdateKey + String(parentId)];

        // forced: drop the entry so fetchQuery below can't reuse it
        if (forced) _queryClient.removeQueries({ queryKey, exact: true });

        if (loading) startLoading(lk);

        // Returns the cached array as-is when fresh, otherwise awaits apiCall() and caches the result
        return _queryClient
            .fetchQuery({ queryKey, queryFn: apiCall, staleTime: customTTL ?? TTL })
            .then((items: (T | undefined)[] = []) => {
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

        // One cache slot per item id, so each target is freshness-tracked independently
        const queryKey = targetKey(id, lastUpdateKey);

        // forced: drop the entry so fetchQuery below can't reuse it
        if (forced) _queryClient.removeQueries({ queryKey, exact: true });

        if (loading) startLoading(lk);

        // The target cache always holds { data } (see seedTarget), so a legitimate
        // `undefined` item is never mistaken for a missing entry, and fetchTarget can
        // unwrap whatever a producer seeded — list, search, parent, create or update.
        return _queryClient
            .fetchQuery<TargetEntry>({
                queryKey,
                queryFn: () => apiCall().then((item) => ({ data: item })),
                staleTime: customTTL ?? TTL
            })
            .then(({ data: item }: TargetEntry) => {
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

        // ids whose target cache entry is missing/stale and must be re-fetched
        const expiredIds: K[] = [];
        // ids whose target cache entry is still fresh — served without a network call
        const cachedIds: K[] = [];

        // Check which ids are stale and need a network fetch
        for (const id of ids) {
            if (!forced && isQueryFresh(targetKey(id, lastUpdateKey), customTTL ?? TTL))
                cachedIds.push(id);
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
     * Drop every search index (page-to-ids maps and totals).
     * The companion of resetRecords(): that one owns the item data, this one owns
     * the "which items answered which search" bookkeeping. Neither touches the
     * TanStack cache. Call both (or destroy()) for a total reset.
     */
    const resetSearches = () => {
        searchCached.value = {};
        searchTotals.value = {};
    };

    /**
     * Wipe the whole client store: records AND every structure that holds bare ids.
     *
     * searchCached and parentHasMany store ids, not records. Dropping records without
     * them leaves dangling ids, and getRecords() silently filters those out — so
     * searchGet/getRecordsByParent would return SHORT arrays instead of refetching.
     * Reset them together or not at all.
     *
     * Does not touch the TanStack cache: its entries stay valid and a later fetch
     * repopulates the dictionary from them without hitting the network.
     */
    const resetAll = () => {
        resetRecords();
        resetSearches();
        parentHasMany.value = {} as typeof parentHasMany.value;
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
     * Query key of one search page.
     *
     * Key order is [loadingKey, 'search', searchKey, lastUpdateKey, page]: `searchKey` precedes
     * `lastUpdateKey` so [loadingKey, 'search', searchKey] prefix-matches EVERY page and EVERY
     * lastUpdateKey bucket of one search, which is what searchCleanup needs to test for liveness.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const searchKeyFor = (searchKey: string, page: number, lastUpdateKey = ''): any[] => [
        loadingKey,
        'search',
        searchKey,
        lastUpdateKey,
        page
    ];
    /** Prefix matching every cached page/bucket of one search */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const searchKeyPrefix = (searchKey: string): any[] => [loadingKey, 'search', searchKey];

    /**
     * Prune searchCached and searchTotals entries that no longer have a
     * corresponding live entry in the TanStack query cache.
     * Keeps at most MAX_SEARCHES entries to bound memory usage.
     */
    const searchCleanup = () => {
        // Upper bound on distinct (filters, pageSize) combinations kept around
        const MAX_SEARCHES = 50;

        // cacheKeys that still have at least one page backed by a live TanStack entry
        const activeKeys: string[] = [];

        for (const cacheKey of Object.keys(searchCached.value)) {
            // Live if ANY page under ANY lastUpdateKey is still cached. Probing a single
            // hardcoded lastUpdateKey would prune searches that are very much alive.
            const hasActivePage = _queryClient
                .getQueryCache()
                .findAll({ queryKey: searchKeyPrefix(cacheKey) })
                .some((query) => query.state.dataUpdatedAt);

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
     * Query key: [loadingKey, 'search', cacheKey, lastUpdateKey, page] — see searchKeyFor
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
        // cacheKey groups all pages for the same (filters, pageSize) combination
        const searchKey = searchKeyGen(filters as object) + ':' + pageSize;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const queryKey: any[] = searchKeyFor(searchKey, page, lastUpdateKey);

        // Prune stale searchCached entries before each search
        searchCleanup();

        // forced: drop the entry so fetchQuery below can't reuse it
        if (forced) _queryClient.removeQueries({ queryKey, exact: true });

        if (loading) startLoading(lk);

        return _queryClient
            .fetchQuery({ queryKey, queryFn: apiCall, staleTime: customTTL ?? TTL })
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

                    if (!mismatch) seedTarget(createIdentifier(item), item);
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

        // for instantaneity, but can be inconsistent
        editRecord(itemData, targetId, true);

        if (loading) startLoading(lk);

        return (
            apiCall()
                // If the apiCall returns the updated item, editRecord will be called again to ensure data consistency
                .then((data) => {
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
        // Remove from TanStack cache optimistically.
        // Prefix match (not exact): a deleted item must not survive in a lastUpdateKey bucket
        _queryClient.removeQueries({ queryKey: targetKeyPrefix(id) });
        if (loading) startLoading(lk);
        return apiCall()
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
        resetSearches,
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
