import { ref, type Ref, type WatchSource } from 'vue';
import { useStructureSearchApi, type IWatchSearchSettings } from './structureSearchApi';
import type { IFetchSettings, IStructureRestApi } from './structureRestApi';

/**
 * The API calls a resource is reached through.
 *
 * All optional: a read-only resource supplies list/get and nothing else, and a method whose
 * operation is missing returns a rejection naming it.
 *
 * @key T - the record
 * @key K - its identifier
 * @key F - the search filters
 * @key C - the create payload
 * @key U - the update payload
 * @key O - per-call options forwarded to your HTTP client (axios config, AbortSignal, ...)
 */
export interface IStructureCrudOperations<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends Record<string | number, any> = Record<string, any>,
    K extends string | number = Extract<keyof T, string | number>,
    F = object,
    C = Partial<T>,
    U = Partial<T>,
    O = unknown
> {
    /** Every record, unpaginated. Powers fetchList. */
    list?: (options?: O) => Promise<(T | undefined)[]>;

    /** One page of a filtered search. Powers watchList, searchNow, resetFilters, fetchPage. */
    search?: (
        filters: F,
        page: number,
        pageSize: number,
        options?: O
    ) => Promise<(T | undefined)[]>;

    /** One record by id. Powers fetchOne, watchOne. */
    get?: (id: K, options?: O) => Promise<T | undefined>;

    /** Creates a record, resolving with it as stored. */
    create?: (data: C, options?: O) => Promise<T | undefined>;

    /** Updates a record, resolving with it as stored. */
    update?: (id: K, data: U, options?: O) => Promise<T | undefined>;

    /** Deletes a record. Resolved value ignored. */
    remove?: (id: K, options?: O) => Promise<unknown>;

    /**
     * Turns an update payload into the patch updateOne applies locally, default the payload
     * itself. Override when the two differ, e.g. a multipart form whose payload carries a File
     * the record has no business holding: `({ imageUpload, ...fields }) => fields`
     */
    optimisticPatch?: (data: U) => Partial<T>;
}

/**
 * Composable customization settings: everything useStructureRestApi accepts, plus the filters.
 */
export interface IStructureCrudSettings<F = object> extends IStructureRestApi {
    // Starting value of `filters`, and what resetFilters() returns to
    initialFilters?: F;
}

/**
 * A whole resource — list, filtered search, read, create, update, delete — from the API calls
 * that reach it.
 *
 * useStructureSearchApi with the wiring done. Everything it returns is passed through, so this
 * layer is a convenience and never a ceiling: drop to fetchTarget, fetchByParent, searchGet and
 * the rest for anything it does not cover.
 *
 * @param operations - see {@link IStructureCrudOperations}
 * @param settings   - see {@link IStructureCrudSettings}
 */
export const useStructureCrudApi = <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends Record<string | number, any> = Record<string, any>,
    K extends string | number = Extract<keyof T, string | number>,
    F = object,
    C = Partial<T>,
    U = Partial<T>,
    O = unknown,
    P extends string | number = string | number
>(
    operations: IStructureCrudOperations<T, K, F, C, U, O> = {},
    { initialFilters, ...settings }: IStructureCrudSettings<F> = {}
) => {
    /**
     * Current search filters, everything except pagination.
     *
     * Editing this does NOT re-run the search: as-you-type vs on-submit is a decision about the
     * screen, not about the resource. Change it, then call searchNow().
     */
    const filters = ref((initialFilters ?? {}) as F) as Ref<F>;

    const api = useStructureSearchApi<T, K, P, F>(() => filters.value, settings);

    /**
     * Answer for a call whose operation was never supplied.
     * A rejection, not a throw, so it surfaces through the same .catch as a failed request.
     *
     * @param operation
     */
    const missing = <R>(operation: keyof IStructureCrudOperations<T, K, F, C, U, O>): Promise<R> =>
        Promise.reject(
            new Error(`useStructureCrudApi - no "${String(operation)}" operation was supplied`)
        );

    /**
     * Apply optimisticPatch, or treat the payload as the patch when there is none.
     *
     * @param data
     */
    const toPatch = (data: U): Partial<T> =>
        operations.optimisticPatch ? operations.optimisticPatch(data) : (data as Partial<T>);

    /**
     * Fetch every record into the dictionary.
     *
     * @param settings - forwarded to fetchAll (forced, TTL, merge, ...)
     */
    const fetchList = (settings: IFetchSettings = {}) =>
        operations.list
            ? api.fetchAll(() => operations.list!(), settings)
            : missing<(T | undefined)[]>('list');

    /**
     * Fetch one unfiltered page, without touching the shared search state.
     *
     * @param page
     * @param pageSize
     * @param settings - forwarded to fetchPaginate
     */
    const fetchPage = (page = 1, pageSize = 10, settings: IFetchSettings = {}) =>
        operations.search
            ? api.fetchPaginate(
                  () => operations.search!({} as F, page, pageSize),
                  page,
                  pageSize,
                  settings
              )
            : missing<(T | undefined)[]>('search');

    /**
     * Run the filtered search and keep it running: now, then on every pageCurrent/pageSize change.
     *
     * @param settings - forwarded to watchSearch. Pass onError: this runs inside a watcher, so a
     *                   rejection is otherwise swallowed
     * @returns { stop, search } — search() re-runs with whatever `filters` now holds
     */
    const watchList = (settings: IWatchSearchSettings<T, F> = {}) =>
        api.watchSearch(
            (currentFilters, page, pageSize) =>
                operations.search
                    ? operations.search(currentFilters, page, pageSize)
                    : missing<(T | undefined)[]>('search'),
            settings
        );

    /**
     * Apply the current filters from page one — the "Search" button.
     *
     * Resetting the page is the point: watchList's watcher fires on a page CHANGE, so a user
     * already on page 1 would otherwise press Search and see nothing happen.
     *
     * @param settings - forwarded to fetchSearch
     */
    const searchNow = (settings: IFetchSettings = {}) => {
        api.pageCurrent.value = 1;
        return operations.search
            ? api.fetchSearch(
                  () => operations.search!(filters.value, 1, api.pageSize.value),
                  filters.value,
                  1,
                  api.pageSize.value,
                  settings
              )
            : missing<(T | undefined)[]>('search');
    };

    /**
     * Clear every filter and search again from page one.
     * Forced: Reset asks for the truth, and answering it out of the cache that produced the state
     * being reset is what it does not mean.
     *
     * @param settings - forwarded to fetchSearch
     */
    const resetFilters = (settings: IFetchSettings = {}) => {
        filters.value = (initialFilters ?? {}) as F;
        return searchNow({ forced: true, ...settings });
    };

    /**
     * Fetch one record and select it, so selectedRecord is what the screen is showing.
     *
     * Selects up front and undoes it on failure — same order as watchTarget, so a record already
     * in the dictionary renders instead of blanking the page. Use fetchTarget directly to load a
     * record WITHOUT making it current.
     *
     * @param id
     * @param settings - forwarded to fetchTarget
     */
    const fetchOne = (id: K, settings: IFetchSettings = {}) => {
        if (!operations.get) return missing<T | undefined>('get');
        api.selectedIdentifier.value = id;
        return api
            .fetchTarget(() => operations.get!(id), id, settings)
            .catch((error: unknown) => {
                api.selectedIdentifier.value = undefined;
                throw error;
            });
    };

    /**
     * fetchOne's reactive counterpart: selects and (re)fetches whenever the id changes.
     *
     * @param idSource - nullish clears the selection
     */
    const watchOne = (idSource: WatchSource<K | undefined | null>) =>
        api.watchTarget(idSource, (id) =>
            operations.get ? operations.get(id) : missing<T | undefined>('get')
        );

    /**
     * Create a record and store it.
     *
     * @param data
     * @param options - per-call HTTP options, forwarded to the operation
     */
    const createOne = (data: C, options?: O) =>
        operations.create
            ? api.createTarget(() => operations.create!(data, options))
            : missing<T | undefined>('create');

    /**
     * Update a record, applying the change locally first and rolling it back on failure.
     *
     * @param id
     * @param data    - see optimisticPatch for what reaches local state
     * @param options - per-call HTTP options, forwarded to the operation
     */
    const updateOne = (id: K, data: U, options?: O) =>
        operations.update
            ? api.updateTarget(() => operations.update!(id, data, options), toPatch(data), id)
            : missing<T | undefined>('update');

    /**
     * Delete a record and drop it from the dictionary.
     *
     * @param id
     * @param options - per-call HTTP options, forwarded to the operation
     */
    const deleteOne = (id: K, options?: O) =>
        operations.remove
            ? api.deleteTarget(() => operations.remove!(id, options), id)
            : missing<unknown>('remove');

    return {
        ...api,

        filters,
        fetchList,
        fetchPage,
        watchList,
        searchNow,
        resetFilters,
        fetchOne,
        watchOne,
        createOne,
        updateOne,
        deleteOne
    };
};

/**
 * Everything {@link useStructureCrudApi} returns.
 */
export type IStructureCrudApi<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends Record<string | number, any> = Record<string, any>,
    K extends string | number = Extract<keyof T, string | number>,
    F = object,
    C = Partial<T>,
    U = Partial<T>,
    O = unknown,
    P extends string | number = string | number
> = ReturnType<typeof useStructureCrudApi<T, K, F, C, U, O, P>>;
