/**
 * Pre-flight freshness checks: "would this call be served from cache, or hit the network?" —
 * answered from the cache alone, without calling the API. There is no `forced` variant: a forced
 * call always fetches.
 *
 * @module internal/freshnessChecks
 */
import type { QueryClient, QueryKey } from '@tanstack/vue-query';
import type { IFetchSettings } from '../composables/structureRestApi.js';
import type { IResourceKeys } from './resourceKeys.js';

/** What the checks need from the resource that owns them. */
export interface IFreshnessContext {
    /** The client the resource's queries live on. */
    queryClient: QueryClient;

    /** The resource's key layout and scope predicates. */
    keys: IResourceKeys;

    /** Reads the current scope snapshot. */
    dependsOn: () => unknown[];

    /** The resource's default freshness window (ms). */
    staleTime: number;
}

/**
 * The freshness checks of one resource.
 *
 * @param context - see IFreshnessContext
 * @returns the checks, plus isFresh and classifyMultiple for the resource's own reads
 */
export const createFreshnessChecks = <K extends string | number, P extends string | number>({
    queryClient,
    keys,
    dependsOn,
    staleTime
}: IFreshnessContext) => {
    /**
     * True when the entry under `queryKey` is cached and fresh.
     *
     * @param queryKey - the entry's key
     * @param custom - freshness window (ms); the resource's when omitted
     * @returns whether a read would be served from cache
     */
    const isFresh = (queryKey: QueryKey, custom?: number): boolean => {
        const query = queryClient.getQueryCache().find({ queryKey, exact: true });
        return query !== undefined && !query.isStaleByTime(custom ?? staleTime);
    };

    /**
     * Would fetchTarget be served from cache?
     *
     * @param id - the record id
     * @param settings - staleTime
     * @returns whether it would
     */
    const checkTarget = (id: K, settings: Pick<IFetchSettings, 'staleTime'> = {}): boolean =>
        isFresh(keys.target(id), settings.staleTime);

    /**
     * Would fetchAll be served from cache?
     *
     * @param settings - key / staleTime
     * @returns whether it would
     */
    const checkAll = (settings: Pick<IFetchSettings, 'key' | 'staleTime'> = {}): boolean =>
        isFresh(keys.entry('all', dependsOn(), [], settings.key), settings.staleTime);

    /**
     * Would fetchByParent be served from cache?
     *
     * @param parentId - the parent id
     * @param settings - key / staleTime
     * @returns whether it would
     */
    const checkByParent = (
        parentId: P,
        settings: Pick<IFetchSettings, 'key' | 'staleTime'> = {}
    ): boolean => isFresh(keys.parent(parentId, dependsOn(), settings.key), settings.staleTime);

    /**
     * Would fetchPaginate be served from cache?
     *
     * @param page - page number
     * @param pageSize - page size
     * @param settings - key / staleTime
     * @returns whether it would
     */
    const checkPaginate = (
        page = 1,
        pageSize = 10,
        settings: Pick<IFetchSettings, 'key' | 'staleTime'> = {}
    ): boolean =>
        isFresh(
            keys.entry('page', dependsOn(), [pageSize, page], settings.key),
            settings.staleTime
        );

    /**
     * Would fetchAny be served from cache? Always false without a key: fetchAny never caches then.
     *
     * @param key - the fetchAny key
     * @param settings - staleTime
     * @returns whether it would
     */
    const checkAny = (key?: string[], settings: Pick<IFetchSettings, 'staleTime'> = {}): boolean =>
        key ? isFresh(keys.entry('any', dependsOn(), [], key), settings.staleTime) : false;

    /**
     * Splits ids into fresh (served from cache) and missing or stale (fetched).
     *
     * @param ids - the record ids
     * @param settings - forced / staleTime
     * @returns the split
     */
    const classifyMultiple = (
        ids: K[],
        settings: Pick<IFetchSettings, 'forced' | 'staleTime'> = {}
    ): { cachedIds: K[]; expiredIds: K[] } => {
        const fresh = (id: K) => !settings.forced && isFresh(keys.target(id), settings.staleTime);
        return {
            cachedIds: ids.filter((id) => fresh(id)),
            expiredIds: ids.filter((id) => !fresh(id))
        };
    };

    /**
     * Which ids would fetchMultiple serve from cache, and which would it fetch?
     *
     * @param ids - the record ids
     * @param settings - staleTime
     * @returns the split
     */
    const checkMultiple = (ids: K[] = [], settings: Pick<IFetchSettings, 'staleTime'> = {}) =>
        classifyMultiple(ids, settings);

    return {
        isFresh,
        classifyMultiple,
        checkTarget,
        checkAll,
        checkByParent,
        checkPaginate,
        checkAny,
        checkMultiple
    };
};
