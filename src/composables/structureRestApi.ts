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
import type { MaybeRefOrGetter, Ref, WatchStopHandle } from 'vue';
import type { QueryClient } from '@tanstack/vue-query';
import { createRestResource } from '../internal/restResource.js';
import type { TIdOf } from './structureDataManagement.js';

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
export interface IStructureRestApi {
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

    /** The last fetch's failure; null after a success. */
    error: Readonly<Ref<unknown>>;
}

/** watchTarget's settings: how to store the answer, and the callbacks it reports through. */
export interface IWatchTargetSettings<T, K>
    extends
        Pick<IFetchSettings, 'forced' | 'merge' | 'staleTime'>,
        IWatchCallbacks<T | undefined, K> {}

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
}

/**
 * A REST resource: records, lists and paginated reads cached in one TanStack `QueryClient`,
 * optimistic mutations with rollback, and reactive views over all of it.
 *
 * @param options - see IStructureRestApi
 * @returns the resource
 */
export const useStructureRestApi = <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string | number, any> = Record<string, any>,
    K extends string | number = TIdOf<T>,
    P extends string | number = string | number
>(
    options: IStructureRestApi
) => createRestResource<T, K, P>(options).api;
