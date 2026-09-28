/**
 * The implementation behind `useStructureRestApi`.
 *
 * Built in layers: the key layout (`resourceKeys`), what is in flight (`resourceActivity`), the
 * records (`queryRecordStore`, under `useStructureDataManagement`) and their relations
 * (`parentRelations`). On top sit three kinds of operation over the same `QueryClient`: one-shot
 * reads (`fetchQuery`), active reads (`useQuery`) and mutations (`resourceMutations`).
 *
 * An answer belongs to the scope baked into ITS OWN running query's key (`keys.scopeOf`), never
 * whatever `dependsOn()` reads by the time it lands — reading it fresh would judge a fetch "late"
 * the instant the fetching instance's own scope moves on, even while a SIBLING instance (same
 * `resourceKey`, same `QueryClient`, a different `dependsOn`) still shows it. Whether an answer
 * may still be stored is instead a question for the live-scope registry (`scopeRegistry.isLive`):
 * a scope nothing claims any more is genuinely abandoned; one another instance still shows is not.
 * A write for a scope other than the CURRENT one runs inside `store.forScope`, so every key it
 * builds — through the `IRecordStore` seam included — addresses that scope, not `dependsOn()`.
 * Every write of an answer also checks that its query was not cancelled (an update/delete
 * cancelled its record's own read). An active query fetches what its own key and `meta` say, never
 * the watcher's live id or page, which may have moved on.
 *
 * A record fetched by an alternate key (`fetchTarget(apiCall, 'my-slug')` resolving `{ id: 7 }`)
 * is stored once, under its own id; the requested key becomes a pointer (`ITargetEntry.aliasOf`)
 * instead of a second, divergent copy — `storeServerRecord` is the one place every server-returned
 * record (a read, an update response, a create response) goes through this rule. Every write and
 * removal follows a pointer to the record it names (`queryRecordStore.ts`'s `resolve`/`keyOf`),
 * and reaches every OTHER pointer to that same record too (`resourceKeys.ts`'s `refersTo`), so an
 * update, a delete or an invalidation by any alias lands on the record itself, not a duplicate.
 *
 * `maxRecords` (`enforceMaxRecords`) spares whatever is on screen, not just what has its OWN
 * observer: a watched list's rows (read off its cached `ids`) and the record behind a watched
 * alias are collected straight from the cache before the wipe, even though neither of THOSE
 * specific entries is itself observed — otherwise a watched list would keep pointing at ids that
 * resolve to nothing, or a watched alias would serve "nothing" for a record no longer there, with
 * nothing telling either to refetch. The bound can be exceeded by what is on screen; that is
 * already true for a directly-watched record and this only extends it.
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
import { useStructureDataManagement, type TIdOf } from '../composables/structureDataManagement.js';
import type {
    IFetchContext,
    IFetchSettings,
    IStructureRestApiOptions,
    ITanStackQueryOptions,
    IWatchAnySettings,
    IWatchHandle,
    IWatchListSettings,
    IWatchTargetSettings,
    TListCall,
    TMultipleCall
} from '../composables/structureRestApi.js';
import { isNil, stableKey } from './plainData.js';
import { pickQueryOptions } from './tanstackQueryOptions.js';
import { joinIdentifiers } from './identifierJoin.js';
import {
    createResourceKeys,
    LIST_KINDS,
    type IListCacheEntry,
    type ITargetEntry,
    type TResourceKind
} from './resourceKeys.js';
import { canWrite } from './recordMutations.js';
import { useResourceActivity } from './resourceActivity.js';
import { createQueryRecordStore } from './queryRecordStore.js';
import { createQueryRelationStore } from './parentRelations.js';
import { watchSettled } from './settleCallbacks.js';
import { createFreshnessChecks } from './freshnessChecks.js';
import { createResourceMutations } from './resourceMutations.js';
import { dropQueries } from './queryRemoval.js';
import { scopeRegistryFor } from './scopeRegistry.js';

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

    /** TanStack `useQuery` options for this call; the resource's own default when omitted. */
    queryOptions?: ITanStackQueryOptions;
}

/**
 * Builds a resource: its public API and the engine the search layer shares.
 *
 * @param options - see IStructureRestApiOptions
 * @returns `api` (public) and `engine` (internal)
 */
export const createRestResource = <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string | number, any> = Record<string, any>,
    K extends string | number = TIdOf<T>,
    P extends string | number = string | number
>({
    identifiers = 'id',
    resourceKey,
    staleTime = 3_600_000, // 1 hour
    dependsOn = () => [],
    maxRecords = 10_000,
    delimiter = '|',
    queryClient: queryClientOption,
    queryOptions: resourceQueryOptions = {}
}: IStructureRestApiOptions) => {
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
    const activity = useResourceActivity(queryClient, resourceKey, (id) => store.resolve(id as K));

    // TanStack defaults, by key prefix (every scope at once). gcTime Infinity: records, parent
    // relations and search pages stay cached while nothing watches them — stale data still
    // renders, and `getListByParent`/`pageItemList` read them straight from the cache. They leave
    // through dependsOn, resetAll and maxRecords instead (records also through resetRecords and
    // deletes).
    queryClient.setQueryDefaults([resourceKey, 'target'], { gcTime: Infinity });
    queryClient.setQueryDefaults([resourceKey, 'parent'], { gcTime: Infinity });
    queryClient.setQueryDefaults([resourceKey, 'search'], { gcTime: Infinity });

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

    /** belongsTo relations, stored as TanStack queries — the same seam as `store`, for `records`. */
    const relationStore = createQueryRelationStore<K, P>({
        queryClient,
        keys,
        dependsOn,
        version: activity.version('parent')
    });

    /** Records, selection, pagination and relations, written through the stores. */
    const records = useStructureDataManagement<T, K, P>(
        identifiers,
        delimiter,
        store,
        relationStore
    );

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
        pageItemList,
        parentHasMany,
        addToParent,
        removeFromParent,
        removeDuplicateChildren,
        getRecordsByParent,
        getListByParent
    } = records;

    /** "Would this call be served from cache?", plus the freshness test the reads share. */
    const { isFresh, classifyMultiple, ...freshnessChecks } = createFreshnessChecks<K, P>({
        queryClient,
        keys,
        dependsOn,
        staleTime
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
     * @param scope - the scope this write belongs to
     * @param readAt - the clock value the read captured when it began; omitted for a mutation's
     *                 own write, which is never guarded (see `IResourceMutationsContext.storeItem`)
     */
    const storeItem = (
        item: T,
        id: K,
        { merge = false, partial = false }: Pick<IFetchSettings, 'merge' | 'partial'> = {},
        scope: unknown[],
        readAt?: number
    ): void => {
        if (readAt !== undefined && !canWrite(queryClient, resourceKey, id, scope, readAt)) return;
        if (partial) editRecord(item, id, true);
        else if (merge) store.asFetched(() => editRecord(item, id, true));
        else store.asFetched(() => addRecord(item));
    };

    /**
     * Reads `item`'s own identifier, WITHOUT `createIdentifier`'s fabricate-a-random-id fallback:
     * `undefined` when it is genuinely not there, never a fabricated one. A partial update
     * response (a merge, an acknowledgement) legitimately carries no id at all — fabricating one
     * to compare against `requestedId` would land the write on a phantom record instead of the
     * one actually being updated.
     *
     * @param item - the value to read an identifier off
     * @returns its id, when every identifier field is genuinely present
     */
    const peekIdentifier = (item: T): K | undefined => {
        const fields = Array.isArray(identifiers) ? identifiers : [identifiers];
        const values = fields.map((field) => (item as Record<string, unknown>)[field]);
        if (values.some((value) => isNil(value))) return undefined;
        return (fields.length > 1 ? joinIdentifiers(values, delimiter) : values[0]) as K;
    };

    /**
     * Stores a record the server returned, under its own id — one rule for every record the
     * server reports, whether from a read, an update response or a create response: it always
     * lives under its own id, and the address it was requested by, if different, becomes a
     * pointer instead of a second, divergent copy (see the alias rule in the module header).
     * Called from inside `store.forScope(scope, ...)`, so `storeItem`'s own writes address `scope`
     * too.
     *
     * @param item - the record, as the server returned it
     * @param requestedId - the id this record was addressed by; omit when there is none (a create)
     * @param scope - the scope this write belongs to
     * @param settings - merge / partial
     * @param readAt - the write guard clock value a READ captured when it began; omitted for a
     *                 mutation's own write, which is never guarded (see `storeItem`)
     * @returns the entry `requestedId`'s own key now holds: the record itself when it matches the
     *          real id, an alias entry otherwise
     */
    const storeServerRecord = (
        item: T,
        requestedId: K | undefined,
        scope: unknown[],
        settings: Pick<IFetchSettings, 'merge' | 'partial'>,
        readAt?: number
    ): ITargetEntry<T> => {
        // A known requestedId is trusted over a response that never carries its own id (see
        // peekIdentifier); only a create (no requestedId at all) needs createIdentifier's
        // fabricate-if-missing fallback.
        const realId =
            requestedId === undefined
                ? createIdentifier(item)
                : (peekIdentifier(item) ?? requestedId);
        storeItem(item, realId, settings, scope, readAt);
        // String(): keys.target() itself keys every id as a string, so '1' and 1 already address
        // the SAME entry — comparing the raw values would treat them as different ids and write
        // an alias pointing an entry at itself, overwriting the record it was meant to hold.
        if (requestedId === undefined || String(requestedId) === String(realId))
            return (
                queryClient.getQueryData<ITargetEntry<T>>(keys.target(realId, scope)) ?? {
                    data: item
                }
            );
        // Addressed by a different id (a slug, say): that address becomes a pointer, not a
        // second, divergent copy.
        const aliasEntry: ITargetEntry<T> = { aliasOf: String(realId) };
        queryClient.setQueryData<ITargetEntry<T>>(keys.target(requestedId, scope), aliasEntry);
        return aliasEntry;
    };

    /** Optimistic writes and free-form commands. */
    const mutations = createResourceMutations<T, K>({
        queryClient,
        resourceKey,
        keys,
        dependsOn,
        records: {
            createIdentifier,
            editRecord,
            deleteRecord,
            markInserted: (id: K) => {
                lastInsertedIdentifier.value = id;
            }
        },
        store,
        storeServerRecord,
        scopeRegistry
    });

    /**
     * Stores a batch of fetched items.
     *
     * @param items - the fetched items; empty slots are skipped
     * @param settings - merge / partial
     * @param scope - the scope this write belongs to
     * @param readAt - the clock value the read captured when it began
     * @returns the stored ids, in order
     */
    const storeItems = (
        items: (T | undefined)[],
        settings: Pick<IFetchSettings, 'merge' | 'partial'>,
        scope: unknown[],
        readAt: number
    ): K[] =>
        items
            .filter((item): item is T => !isNil(item))
            .map((item) => {
                const id = createIdentifier(item);
                storeItem(item, id, settings, scope, readAt);
                return id;
            });

    /**
     * Past `maxRecords`, removes every query of `scope` except `keep` (the call writing right
     * now), the ones still fetching (their answers are on the way), and the ones something is
     * actively watching (they're on screen — a wipe would empty a detail view with nothing to
     * refetch it). Those still count toward the bound; they're just never the ones evicted.
     *
     * @param incoming - how many records not cached yet are about to be written
     * @param keep - key of the query writing them
     * @param scope - the scope the writing query belongs to
     */
    const enforceMaxRecords = (incoming: number, keep: QueryKey, scope: unknown[]): void => {
        if (maxRecords <= 0) return;
        const inScope = keys.inScope(scope);
        const scoped = queryClient.getQueryCache().findAll({ predicate: inScope });
        const cached = scoped.filter(
            (query) =>
                query.queryKey[1] === 'target' &&
                // An alias entry (see targetQueryFunction) holds no record of its own: it
                // never counts as one of the bound's cached records.
                (query.state.data as ITargetEntry<T> | undefined)?.data !== undefined
        );
        if (cached.length + incoming <= maxRecords) return;
        const kept = queryClient.getQueryCache().find({ queryKey: keep, exact: true });
        // What is on screen right now, straight from the cache: the ids of a watched list's own
        // rows, and the record behind a watched alias. Neither query has its OWN observer, so
        // without this a wipe would still drop them — leaving a watched list pointing at ids that
        // resolve to nothing, or a watched alias serving "nothing" for a record no longer there,
        // with nothing telling either to refetch (see the `maxRecords` rule in the module header).
        const protectedIds = new Set<string>();
        for (const query of scoped) {
            if (query.getObserversCount() === 0) continue;
            const kind = query.queryKey[1] as TResourceKind;
            if (LIST_KINDS.includes(kind)) {
                const ids = (query.state.data as IListCacheEntry<K> | undefined)?.ids ?? [];
                for (const id of ids) protectedIds.add(String(id));
            } else if (kind === 'target') {
                const aliasOf = (query.state.data as ITargetEntry<T> | undefined)?.aliasOf;
                if (aliasOf !== undefined) protectedIds.add(aliasOf);
            }
        }
        dropQueries(
            queryClient,
            (query) =>
                inScope(query) &&
                query !== kept &&
                query.state.fetchStatus !== 'fetching' &&
                query.getObserversCount() === 0 &&
                !(query.queryKey[1] === 'target' && protectedIds.has(query.queryKey[3] as string))
        );
    };

    /**
     * Stores a fetched batch under the scope it was asked in — the running query's own scope
     * (`scope`), not whatever `dependsOn()` reads now. Stores nothing when the query was
     * cancelled, or when nothing claims `scope` any more (no instance shows it, and the scope
     * registry has already swept it): a late answer for an abandoned scope has nowhere to land.
     *
     * @param items - the fetched items
     * @param scope - the scope the running query belongs to (see `resourceKeys.ts`'s `scopeOf`)
     * @param running - the query writing them (kept through a `maxRecords` wipe)
     * @param settings - merge / partial
     * @param readAt - the clock value the read captured when it began
     * @returns the stored ids, in order
     */
    const storeBatch = (
        items: (T | undefined)[] = [],
        scope: unknown[],
        running: IRunningQuery,
        settings: Pick<IFetchSettings, 'merge' | 'partial'>,
        readAt: number
    ): K[] => {
        if (running.isCancelled() || !scopeRegistry.isLive(scope)) return [];
        return store.forScope(scope, () => {
            /** Whether `item`'s record is already cached under `scope`. */
            const isCached = (item: T): boolean => {
                const key = keys.target(createIdentifier(item), scope);
                return !isNil(queryClient.getQueryData<ITargetEntry<T>>(key)?.data);
            };
            // Only records not cached yet grow the cache: a refetch of the same list adds nothing.
            const added = items.filter((item) => !isNil(item) && !isCached(item));
            enforceMaxRecords(added.length, running.queryKey, scope);
            return storeItems(items, settings, scope, readAt);
        });
    };

    /**
     * Removes a query that failed before ever holding data: it is only an error marker. One that
     * holds data keeps serving it — stale data still renders. Left alone when a watcher observes
     * it: removing it there would silently detach that watcher (TanStack never tells an observer
     * its query left the cache), wiping the error it is meant to show and retry on its own.
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
        return apiCall(readContextOf(running)).then((item) => {
            // Cancelled (an update or delete of this record started), or nothing claims this
            // scope any more: store nothing.
            if (isNil(item) || running.isCancelled() || !scopeRegistry.isLive(scope))
                return { data: item };
            const realId = createIdentifier(item);
            // A mutation on this record owns it: cancel THIS query's own fetch instead of
            // resolving with the answer. TanStack then discards whatever this function returns
            // and reverts the query to what is already cached, with its ORIGINAL timestamp —
            // never resurrecting a just-deleted record, never stamping an unconfirmed optimistic
            // patch fresh (see `recordMutations.ts`).
            if (!canWrite(queryClient, resourceKey, realId, scope, readAt)) {
                void queryClient.cancelQueries({ queryKey: running.queryKey, exact: true });
                return { data: undefined };
            }
            const targetKey = keys.target(realId, scope);
            return store.forScope(scope, () => {
                // Single-record fetches never went through enforceMaxRecords (only list-shaped
                // ones did): browsing many detail pages one at a time, each cached with
                // gcTime: Infinity, grew the cache without bound. Only a genuinely new id counts —
                // a refetch of one already cached doesn't grow the total.
                if (queryClient.getQueryData<ITargetEntry<T>>(targetKey)?.data === undefined)
                    enforceMaxRecords(1, targetKey, scope);
                // Stores under the record's OWN id, whatever id this query was fetched by
                // (`fetchTarget(apiCall, 'my-slug')` resolving `{ id: 7 }`) — `id` becomes a
                // pointer instead of a second, divergent copy (see storeServerRecord).
                return storeServerRecord(item, id, scope, { merge }, readAt);
            });
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
     * @returns the `useQuery` result, its scope, `refetch` and `suspense`
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
        /** Fetches now; cancelRefetch: false joins a fetch already running instead of restarting it. */
        const refetch = () => query.refetch({ cancelRefetch: false });
        /**
         * TanStack: `suspense()` on a query whose `enabled` is currently false never resolves — it
         * only starts once `enabled` later turns true, which for a disabled watcher (no id yet,
         * `enabled: false`) may be never. Resolve with whatever is cached instead of hanging.
         */
        const suspense = (): Promise<{ data: E | undefined }> =>
            toValue(enabled) ? query.suspense() : Promise.resolve({ data: query.data.value });
        return { query, scope, refetch, suspense };
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
            const readAt = performance.now();
            return settleRead(
                // Wrapped: TanStack refuses a query function that resolves undefined. The scope
                // travels with the answer, taken from the running query's own key — not
                // re-read from dependsOn() once the answer lands, which may be later (see the
                // scope rule in the module header).
                runThrowaway(scopeAtStart, (running) =>
                    apiCall(readContextOf(running)).then((item) => ({
                        data: item,
                        scope: keys.scopeOf(running.queryKey)
                    }))
                ),
                ({ data: item, scope }): T | undefined => {
                    if (isNil(item) || !scopeRegistry.isLive(scope)) return item;
                    const itemId = createIdentifier(item);
                    return store.forScope(scope, () => {
                        storeItem(item, itemId, { merge: settings.merge }, scope, readAt);
                        return store.read(itemId);
                    });
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
     * @param apiCall - resolves the record for an id
     * @param idSource - Ref, ComputedRef or getter producing the id
     * @param settings - forced / merge / staleTime, and the settle callbacks
     * @returns the watcher handle
     */
    const watchTarget = (
        apiCall: (id: K, context: IFetchContext) => Promise<T | undefined>,
        idSource: WatchSource<K | undefined | null>,
        { onSuccess, onError, onSettled, ...settings }: IWatchTargetSettings<T, K> = {}
    ): IWatchHandle<T | undefined> => {
        /** The watched id; nullish reads as undefined. */
        const currentId = (): K | undefined => toValue(idSource) ?? undefined;

        /** The record's entry, or a disabled placeholder while there is no id. */
        const queryKey = (): unknown[] => {
            const id = currentId();
            return id === undefined ? keys.idle() : keys.target(id);
        };

        const { query, scope, refetch, suspense } = watchQuery<ITargetEntry<T>>({
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
                return id === undefined ? Promise.resolve(id) : refetch().then(() => getRecord(id));
            },
            suspense: () => {
                const id = currentId();
                return id === undefined
                    ? Promise.resolve(id)
                    : suspense().then(() => getRecord(id));
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
        const { query, scope, refetch, suspense } = watchQuery<IListCacheEntry<K>>({
            queryKey,
            meta,
            fetch: (running) => listQueryFunction(() => apiCall(running), settings, running),
            enabled: settings.enabled,
            forced: settings.forced,
            staleTime: settings.staleTime,
            key: settings.key,
            queryOptions: settings.queryOptions
        });
        return {
            stop: () => scope.stop(),
            refetch: () => refetch().then((result) => itemsOf(result.data)),
            suspense: () => suspense().then((result) => itemsOf(result.data)),
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
     * calling apiCall — there is nothing to ask for yet, `refetch()` included.
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
            }
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
        const { query, scope, refetch, suspense } = watchQuery<{ data: F }>({
            queryKey: () => keys.entry('any', dependsOn(), [], toValue(settings.key)),
            // Wrapped: TanStack refuses a query function that resolves undefined.
            fetch: (running) => apiCall(readContextOf(running)).then((data) => ({ data })),
            enabled: settings.enabled,
            forced: settings.forced,
            staleTime: settings.staleTime,
            key: settings.key,
            queryOptions: settings.queryOptions
        });
        const handle: IWatchHandle<F | undefined> = {
            stop: () => scope.stop(),
            refetch: () => refetch().then((result) => result.data?.data),
            suspense: () => suspense().then((result) => result.data?.data),
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
        const readAt = performance.now();
        return settleRead(
            runThrowaway(scopeAtStart, (running) =>
                apiCall(expiredIds, readContextOf(running)).then((items) =>
                    storeBatch(items, keys.scopeOf(running.queryKey), running, settings, readAt)
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
        parentHasMany,
        addToParent,
        removeFromParent,
        removeDuplicateChildren,
        getRecordsByParent,
        getListByParent,

        // loading
        loading: activity.loading,
        isLoading: activity.isLoading,
        isSaving: activity.isSaving,

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
