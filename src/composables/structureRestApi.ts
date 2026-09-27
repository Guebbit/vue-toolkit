/**
 * Public contract of a REST resource: its options, per-call settings, watcher shapes, and the
 * `useStructureRestApi` entry point.
 *
 * The implementation lives in `internal/restResource`: one TanStack `QueryClient` holds every
 * record, list and search, keyed `[resourceKey, kind, dependsOn, ...]`, and the composable is a
 * normalized, read-only view over it plus the operations that fill it.
 *
 * @module composables/structureRestApi
 * @see docs/composables/structure-rest-api.md
 */
import type { ComputedRef, MaybeRefOrGetter, Ref, WatchSource, WatchStopHandle } from 'vue';
import type { QueryClient } from '@tanstack/vue-query';
import { createRestResource } from '../internal/restResource.js';
import type { TIdOf } from './structureDataManagement.js';

/**
 * A narrow, explicit pick of TanStack's own `useQuery` options — everything the engine does not
 * own. `queryFn`/`queryKey`/`gcTime` stay the engine's: they encode the cache layout every
 * fetch/watch method relies on, and letting a caller override them would break it. Set on the
 * resource as a default for every query it makes, or per watcher to override it there.
 *
 * Hand-declared, matching TanStack's own shapes, rather than picked from its types: those are
 * generic over the query's data (`Query<TQueryFnData, ...>`), which would force this option
 * itself to carry that generic through every composable and watcher setting it appears on, for a
 * dynamic per-query callback form this package has no need to support.
 */
export interface ITanStackQueryOptions {
    /**
     * Retries a failed fetch this many times (default varies by call: TanStack's own default is
     * 3 for an active query, 0 for a one-shot read), or a predicate deciding whether to.
     */
    retry?: boolean | number | ((failureCount: number, error: unknown) => boolean);

    /** Delay (ms) before each retry, or a function of the failure count and the error. */
    retryDelay?: number | ((failureCount: number, error: unknown) => number);

    /** Re-fetches on this interval (ms) while mounted; `false` (the default) disables it. */
    refetchInterval?: number | false;

    /** Re-fetches when the window regains focus. */
    refetchOnWindowFocus?: boolean | 'always';

    /** Re-fetches when the network reconnects. */
    refetchOnReconnect?: boolean | 'always';
}

/**
 * The context every read `apiCall` receives, as its last parameter. `signal` is a lazy getter:
 * TanStack only aborts the underlying fetch once something actually reads it, so an `apiCall`
 * that ignores the context loses nothing, while one that forwards `signal` to `fetch`/axios gets
 * a request that is genuinely cancelled on unmount or a superseding call.
 */
export interface IFetchContext {
    /** Aborted once nothing needs this fetch any more. Reading it opts into that. */
    readonly signal: AbortSignal;
}

/** `fetchAll`/`fetchByParent`/`fetchPaginate`/`watchAll`'s apiCall: resolves a list's items. */
export type TListCall<T> = (context: IFetchContext) => Promise<(T | undefined)[]>;

/** `fetchMultiple`'s apiCall: resolves the ids it was asked to fetch, missing or stale ones only. */
export type TMultipleCall<T, K> = (ids: K[], context: IFetchContext) => Promise<(T | undefined)[]>;

/**
 * Per-call settings of a fetch. Unset fields fall back to the resource's defaults. Each method
 * accepts the subset that means something for it (see its signature).
 */
export interface IFetchSettings {
    /**
     * Skip the cache: run the call with `staleTime: 0`, so anything cached counts as stale and the
     * server is asked. A concurrent call for the same data joins this request instead of racing it.
     * On an active watcher: every mount or key switch asks the server.
     */
    forced?: boolean;

    /**
     * Merge the fetched data into the stored record instead of replacing it. For fetches that
     * return different subsets of fields for the same record.
     */
    merge?: boolean;

    /**
     * How long (ms) data counts as fresh before a read refetches it. Overrides the resource's
     * `staleTime` for this call.
     */
    staleTime?: number;

    /**
     * Extra segments appended to the cache key of a list or `fetchAny`/`watchAny` call — an
     * independent bucket for the same call shape (one per dashboard widget, say) — and what
     * `isLoading(key)` matches the call by, on queries and mutations alike. Records ignore it: a
     * record has one cache entry, keyed only by its id.
     */
    key?: string[];

    /**
     * The response holds partial records: merge them (never replace) and keep each record's
     * existing freshness, so the next full `fetchTarget` still asks the server. List-shaped
     * fetches only (fetchAll, fetchByParent, fetchPaginate, fetchSearch and their watchers).
     */
    partial?: boolean;
}

/** updateTarget's settings: `merge` and `key`, plus whether to store the response. */
export interface IUpdateTargetSettings extends Pick<IFetchSettings, 'merge' | 'key'> {
    /**
     * Store the apiCall's response as the record's new, full data (default true). Turn off when
     * the response is not the updated record (an acknowledgement, say): the optimistic patch
     * then stays as the record.
     */
    applyResponse?: boolean;
}

/** Options of a resource. */
export interface IStructureRestApiOptions {
    /**
     * The record field (or fields, joined by `delimiter`) that identifies a record. Order
     * matters when there are several. Default `'id'`.
     */
    identifiers?: string | string[];

    /**
     * First segment of every query and mutation key this resource makes: what
     * `queryClient.invalidateQueries({ queryKey: [resourceKey] })` addresses from anywhere in the
     * app, and what `useIsLoading` matches by prefix. Required: there is no fallback, since a
     * random one would make both unreachable.
     */
    resourceKey: string;

    /**
     * Default freshness window (ms) of this resource's fetches: how long data counts as fresh
     * before a read refetches it. Default 1 hour. A per-call `staleTime` overrides it.
     */
    staleTime?: number;

    /**
     * The values this resource's data depends on — whose data, which language:
     * `() => [session.userId, locale.value]`. Read fresh at the start of every call. When it
     * changes, every query of this resource under the old value (records included) is cancelled
     * and removed, and every active watcher re-runs under the new one.
     */
    dependsOn?: () => unknown[];

    /**
     * Upper bound on the records cached under the current `dependsOn`. A list fetch that would
     * cross it first removes every other query of the resource's current scope: a critical-mass
     * backstop, not an eviction policy. Default 10 000; 0 disables it.
     */
    maxRecords?: number;

    /** Joins the values of multiple `identifiers` into one id. Default `'|'`. */
    delimiter?: string;

    /**
     * The `QueryClient` this resource lives on. Default: the one `VueQueryPlugin` provides,
     * through `useQueryClient()` (which also works inside a Pinia setup store). One client per
     * app is what lets resources invalidate each other.
     */
    queryClient?: QueryClient;

    /**
     * TanStack `useQuery` options, applied to every ACTIVE query this resource's `watch*` methods
     * make (not one-shot `fetch*` reads, which TanStack's own `retry`/`refetch*` options do not
     * apply to). A watcher's own `queryOptions` setting overrides this per call.
     */
    queryOptions?: ITanStackQueryOptions;
}

/** Callbacks an active watcher reports each settle through. */
export interface IWatchCallbacks<R, C> {
    /** After a successful fetch, or a switch to data already cached and fresh. */
    onSuccess?: (result: R, context: C) => void;

    /** After a failed fetch. */
    onError?: (error: unknown, context: C) => void;

    /** After either outcome. */
    onSettled?: (result: R | undefined, error: unknown, context: C) => void;
}

/**
 * What every `watch*` returns. A watcher never rejects: a failure shows in `error` (and
 * `onError`, where offered), and `refetch()` resolves with whatever is cached.
 */
export interface IWatchHandle<R> {
    /** Stops the watcher; its query stays cached. */
    stop: WatchStopHandle;

    /**
     * Fetches again now, joining a fetch already running. Resolves with the watched data as
     * cached afterwards: a failure leaves the previous data (and shows in `error`).
     */
    refetch: () => Promise<R>;

    /**
     * Resolves once the watched data is available — cached and fresh already, or after the fetch
     * that gets it there. For SSR: call it in `onServerPrefetch`, before the component renders, so
     * the client hydrates with data already in the cache instead of fetching again on mount.
     * Resolves right away, with whatever is currently cached (possibly `undefined`), for a
     * watcher that is not currently enabled (no id yet, `enabled: false`) — the underlying query
     * would otherwise wait for `enabled` to turn true, which may be never.
     */
    suspense: () => Promise<R>;

    /** The last fetch's failure; null after a success. */
    error: Readonly<Ref<unknown>>;
}

/** watchTarget's settings: how to store the answer, and the callbacks it reports through. */
export interface IWatchTargetSettings<T, K>
    extends
        Pick<IFetchSettings, 'forced' | 'merge' | 'staleTime'>,
        IWatchCallbacks<T | undefined, K> {
    /** TanStack `useQuery` options for this call; overrides the resource's own default. */
    queryOptions?: ITanStackQueryOptions;
}

/**
 * watchAll's/watchByParent's settings: `IFetchSettings`, but `key` and `enabled` may be reactive
 * (a Ref, a ComputedRef or a getter) — a change re-runs the watcher just like a key or id switch
 * does.
 */
export interface IWatchListSettings extends Omit<IFetchSettings, 'key'> {
    /**
     * Extra cache-key segments, and what `isLoading(key)` matches the query by. May be reactive.
     */
    key?: MaybeRefOrGetter<string[] | undefined>;

    /** Whether the query may fetch on its own (default true). May be reactive. */
    enabled?: MaybeRefOrGetter<boolean>;

    /** TanStack `useQuery` options for this call; overrides the resource's own default. */
    queryOptions?: ITanStackQueryOptions;
}

/**
 * watchAny's settings: `key` is required (an active query needs a stable identity), and may be
 * reactive, like `enabled`.
 */
export interface IWatchAnySettings extends Pick<IFetchSettings, 'forced' | 'staleTime'> {
    /** Cache-key segments; required. May be reactive. */
    key: MaybeRefOrGetter<string[]>;

    /** Whether the query may fetch on its own (default true). May be reactive. */
    enabled?: MaybeRefOrGetter<boolean>;

    /** TanStack `useQuery` options for this call; overrides the resource's own default. */
    queryOptions?: ITanStackQueryOptions;
}

/**
 * What {@link useStructureRestApi} returns, as an explicit interface (not inferred) so the public
 * `.d.ts` never has to reference this package's own internals to describe it.
 */
export interface IStructureRestApi<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string | number, any> = Record<string, any>,
    K extends string | number = TIdOf<T>,
    P extends string | number = string | number
> {
    /** The id of a record: its identifier field(s), joined by `delimiter` when several. */
    createIdentifier: <C = T>(itemData: C, customIdentifiers?: string | string[]) => K;

    /** The identifier field name(s), joined by `delimiter` when several. */
    identifierKey: string;

    /** First segment of every query and mutation key this resource makes. */
    resourceKey: string;

    /** Upper bound on the records cached under the current `dependsOn`. */
    maxRecords: number;

    /** The `QueryClient` this resource lives on. */
    queryClient: QueryClient;

    /** Every record cached under the current `dependsOn`, by id. */
    itemDictionary: Ref<Record<K, T>>;

    /** Every record cached under the current `dependsOn`, as a list. */
    itemList: Ref<T[]>;

    /** Replaces every record of the current scope; none of them counts as fetched. */
    setRecords: (items: Record<K, T>) => Record<K, T>;

    /** Removes every record of the current scope, and marks its lists stale. */
    resetRecords: () => void;

    /** Drops every query of this resource under the current `dependsOn`. */
    resetAll: () => void;

    /** One record by id. Several arguments are joined by `delimiter` (multiple identifiers). */
    getRecord: (..._arguments: (K | undefined)[]) => T | undefined;

    /** Several records by id; ids not stored are skipped. */
    getRecords: (idsArray?: (K | (K | undefined)[])[]) => T[];

    /** Stores a record, replacing any record with the same id. Its freshness does not move. */
    addRecord: (itemData: T) => T;

    /** Stores several records (see `addRecord`); empty slots are skipped. */
    addRecords: (itemsArray: (T | undefined)[]) => void;

    /** Merges `data` into a record (creating it when `create` is on). Freshness does not move. */
    editRecord: (data?: Partial<T>, id?: K | K[], create?: boolean) => K | undefined;

    /** Merges several records (see `editRecord`); empty slots are skipped. */
    editRecords: (itemsArray: (T | undefined)[]) => void;

    /** Removes a record. */
    deleteRecord: (id: K) => boolean | undefined;

    /** Id of the selected record. */
    selectedIdentifier: Ref<K | undefined>;

    /** The record of `selectedIdentifier`. */
    selectedRecord: Ref<T | undefined>;

    /** Id of the most recently inserted (created, not merely updated) record. */
    lastInsertedIdentifier: Ref<K | undefined>;

    /** Ids inserted by the most recent batch call. */
    lastInsertedIdentifiers: Ref<K[]>;

    /** The record of `lastInsertedIdentifier`. */
    lastInsertedRecord: Ref<T | undefined>;

    /** Current page, from 1 (client-side pagination over `itemList`). */
    pageCurrent: Ref<number>;

    /** Records per page. Clamped to a minimum of 1 on write. */
    pageSize: Ref<number>;

    /** Page count. */
    pageTotal: Ref<number>;

    /** Index of the current page's first record. */
    pageOffset: Ref<number>;

    /** The current page's records. */
    pageItemList: Ref<T[]>;

    /** Every parent's child ids under the current scope: the union of its `fetchByParent` buckets. */
    parentHasMany: Ref<Record<P, K[]>>;

    /** Links a child to a parent, once, into the parent's plain (keyless) entry. */
    addToParent: (parentId: P, childId: K) => void;

    /** Unlinks a child from a parent, in every bucket. */
    removeFromParent: (parentId: P, childId: K) => void;

    /** Drops repeated child ids of a parent, in every bucket. */
    removeDuplicateChildren: (parentId: P) => void;

    /** A parent's children, by id. Ids whose record is not cached are skipped. */
    getRecordsByParent: (parentId?: P) => Record<K, T>;

    /** A parent's children, as a list in the relation's order. Ids not cached are skipped. */
    getListByParent: (parentId?: P) => T[];

    /** True while anything of this resource is in flight. Same as `isLoading()`. */
    loading: ComputedRef<boolean>;

    /** True while a query or mutation of this resource runs whose `key` starts with `key`. */
    isLoading: (key?: string[]) => boolean;

    /**
     * True while an update or delete mutation on record `id` is running — a per-row pending
     * signal for a row's own spinner, distinct from `loading`/`isLoading`, which cover the whole
     * resource. A plain function, like `isLoading`: call it inside a `computed` to track it.
     */
    isSaving: (id: K) => boolean;

    /** Generic read for anything that is not a record. */
    fetchAny: <F = unknown>(
        apiCall: (context: IFetchContext) => Promise<F>,
        settings?: Pick<IFetchSettings, 'forced' | 'staleTime' | 'key'>
    ) => Promise<F | undefined>;

    /** Get every item from the server. */
    fetchAll: (apiCall: TListCall<T>, settings?: IFetchSettings) => Promise<(T | undefined)[]>;

    /** Same as `fetchAll`, for the children of one parent. */
    fetchByParent: (
        apiCall: TListCall<T>,
        parentId: P,
        settings?: IFetchSettings
    ) => Promise<(T | undefined)[]>;

    /** Get one record from the server. */
    fetchTarget: (
        apiCall: (context: IFetchContext) => Promise<T | undefined>,
        id?: K,
        settings?: Pick<IFetchSettings, 'forced' | 'merge' | 'staleTime'>
    ) => Promise<T | undefined>;

    /** Fetch several records by id, asking the server only for the missing or stale ones. */
    fetchMultiple: (
        apiCall: TMultipleCall<T, K>,
        ids?: K[],
        settings?: Pick<IFetchSettings, 'forced' | 'merge' | 'staleTime'>
    ) => Promise<(T | undefined)[]>;

    /** One server-paginated page, unfiltered. */
    fetchPaginate: (
        apiCall: TListCall<T>,
        page?: number,
        pageSize?: number,
        settings?: IFetchSettings
    ) => Promise<(T | undefined)[]>;

    /** fetchTarget's active counterpart: selects the id and keeps its record fetched. */
    watchTarget: (
        apiCall: (id: K, context: IFetchContext) => Promise<T | undefined>,
        idSource: WatchSource<K | undefined | null>,
        settings?: IWatchTargetSettings<T, K>
    ) => IWatchHandle<T | undefined>;

    /** fetchAll's active counterpart. */
    watchAll: (
        apiCall: TListCall<T>,
        settings?: IWatchListSettings
    ) => IWatchHandle<(T | undefined)[]>;

    /** fetchByParent's active counterpart: also re-runs when the parent id changes. */
    watchByParent: (
        apiCall: (parentId: P, context: IFetchContext) => Promise<(T | undefined)[]>,
        parentId: MaybeRefOrGetter<P | undefined | null>,
        settings?: IWatchListSettings
    ) => IWatchHandle<(T | undefined)[]>;

    /** fetchAny's active counterpart. Also returns `data`, since the answer is not a record. */
    watchAny: <F = unknown>(
        apiCall: (context: IFetchContext) => Promise<F>,
        settings: IWatchAnySettings
    ) => IWatchHandle<F | undefined> & { data: ComputedRef<F | undefined> };

    /** A command that fits no record shape, run as a one-shot mutation. */
    mutateAny: <F = unknown>(
        apiCall: () => Promise<F>,
        settings?: Pick<IFetchSettings, 'key'>
    ) => Promise<F>;

    /** Create a record and store it. */
    createTarget: (
        apiCall: () => Promise<T | undefined>,
        dummyData?: T,
        settings?: Pick<IFetchSettings, 'key'>
    ) => Promise<T | undefined>;

    /** Update a record: applied locally first, rolled back on failure. */
    updateTarget: <F = T>(
        apiCall: () => Promise<F>,
        itemData: Partial<T>,
        id?: K,
        settings?: IUpdateTargetSettings
    ) => Promise<F>;

    /** Delete a record: removed locally first, restored on failure. */
    deleteTarget: <F = unknown>(
        apiCall: () => Promise<F>,
        id: K,
        settings?: Pick<IFetchSettings, 'key'>
    ) => Promise<F>;

    /** Would `fetchTarget(apiCall, id)` be served from cache? */
    checkTarget: (id: K, settings?: Pick<IFetchSettings, 'staleTime'>) => boolean;

    /** Would `fetchAll` be served from cache? */
    checkAll: (settings?: Pick<IFetchSettings, 'key' | 'staleTime'>) => boolean;

    /** Would `fetchByParent` be served from cache? */
    checkByParent: (parentId: P, settings?: Pick<IFetchSettings, 'key' | 'staleTime'>) => boolean;

    /** Would `fetchPaginate` be served from cache? */
    checkPaginate: (
        page?: number,
        pageSize?: number,
        settings?: Pick<IFetchSettings, 'key' | 'staleTime'>
    ) => boolean;

    /** Would `fetchAny` be served from cache? Always false without a key. */
    checkAny: (key?: string[], settings?: Pick<IFetchSettings, 'staleTime'>) => boolean;

    /** Which ids would `fetchMultiple` serve from cache, and which would it fetch? */
    checkMultiple: (
        ids?: K[],
        settings?: Pick<IFetchSettings, 'staleTime'>
    ) => { cachedIds: K[]; expiredIds: K[] };
}

/**
 * A REST resource: records, lists and paginated reads cached in one TanStack `QueryClient`,
 * optimistic mutations with rollback, and reactive views over all of it.
 *
 * @param options - see IStructureRestApiOptions
 * @returns the resource
 */
export const useStructureRestApi = <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string | number, any> = Record<string, any>,
    K extends string | number = TIdOf<T>,
    P extends string | number = string | number
>(
    options: IStructureRestApiOptions
): IStructureRestApi<T, K, P> => createRestResource<T, K, P>(options).api;
