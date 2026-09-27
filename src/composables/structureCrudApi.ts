/**
 * A whole resource — list, filtered search, read, create, update, delete — declared from the API
 * calls that reach it.
 *
 * `useStructureSearchApi` with the wiring done: each operation you supply powers a ready-made
 * method, and a missing one makes its methods reject with a clear error. Everything the search
 * layer returns is passed through, so this is a convenience, never a ceiling.
 *
 * @module composables/structureCrudApi
 * @see docs/composables/structure-crud-api.md
 */
import { ref, type Ref, type WatchSource } from 'vue';
import { detachedCopy } from '../internal/plainData.js';
import type { TIdOf } from './structureDataManagement.js';
import {
    useStructureSearchApi,
    type ISearchResult,
    type IWatchSearchSettings
} from './structureSearchApi.js';
import type {
    IFetchContext,
    IFetchSettings,
    IStructureRestApi,
    IUpdateTargetSettings,
    IWatchTargetSettings
} from './structureRestApi.js';

/**
 * The API calls a resource is reached through. All optional: a read-only resource supplies
 * `list`/`get` and nothing else, and a method whose operation is missing rejects naming it.
 *
 * Type parameters: `T` the record, `K` its identifier, `F` the search filters, `C` the create
 * payload, `U` the update payload, `O` per-call options the writes (createOne, updateOne,
 * deleteOne) forward to your HTTP client (axios config, AbortSignal, ...).
 */
export interface IStructureCrudOperations<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string | number, any> = Record<string, any>,
    K extends string | number = TIdOf<T>,
    F = object,
    C = Partial<T>,
    U = Partial<T>,
    O = unknown
> {
    /** Every record, unpaginated. Powers fetchList. */
    list?: (context: IFetchContext) => Promise<(T | undefined)[]>;

    /**
     * One page of a filtered search, with the server's total — what keeps "124 orders" and the
     * pager right even on a cache hit. Powers watchList, searchNow, resetFilters, fetchPage.
     */
    search?: (
        filters: F,
        page: number,
        pageSize: number,
        context: IFetchContext
    ) => Promise<ISearchResult<T>>;

    /** One record by id. Powers fetchOne, watchOne. */
    get?: (id: K, context: IFetchContext) => Promise<T | undefined>;

    /** Creates a record, resolving with it as stored. */
    create?: (data: C, options?: O) => Promise<T | undefined>;

    /** Updates a record, resolving with it as stored. */
    update?: (id: K, data: U, options?: O) => Promise<T | undefined>;

    /** Deletes a record. Resolved value ignored. */
    remove?: (id: K, options?: O) => Promise<unknown>;

    /**
     * Turns an update payload into the patch updateOne applies locally (default: the payload
     * itself). Override when the two differ, e.g. a multipart form whose payload carries a File
     * the record has no business holding: `({ imageUpload, ...fields }) => fields`
     */
    optimisticPatch?: (data: U) => Partial<T>;
}

/** Options of a CRUD resource: everything useStructureRestApi accepts, plus the filters. */
export interface IStructureCrudSettings<F = object> extends IStructureRestApi {
    /** Starting value of `filters`, and what resetFilters() returns to. */
    initialFilters?: F;
}

/** createOne's settings. */
export interface ICreateOneSettings<T, O> {
    /** Forwarded as the `create` operation's second argument (axios config, a signal, ...). */
    requestOptions?: O;

    /** Renders at once under a temporary id while the request runs (see createTarget). */
    dummyData?: T;

    /** Bucket key, and what `isLoading(key)` matches. */
    key?: string[];
}

/** updateOne's settings. */
export interface IUpdateOneSettings<O> extends Pick<
    IUpdateTargetSettings,
    'merge' | 'applyResponse' | 'key'
> {
    /** Forwarded as the `update` operation's third argument (axios config, a signal, ...). */
    requestOptions?: O;
}

/** deleteOne's settings. */
export interface IDeleteOneSettings<O> {
    /** Forwarded as the `remove` operation's second argument (axios config, a signal, ...). */
    requestOptions?: O;

    /** Bucket key, and what `isLoading(key)` matches. */
    key?: string[];
}

/**
 * A whole resource from the API calls that reach it.
 *
 * @param operations - see IStructureCrudOperations
 * @param settings - see IStructureCrudSettings
 * @returns the resource
 */
export const useStructureCrudApi = <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string | number, any> = Record<string, any>,
    K extends string | number = TIdOf<T>,
    F = object,
    C = Partial<T>,
    U = Partial<T>,
    O = unknown,
    P extends string | number = string | number
>(
    operations: IStructureCrudOperations<T, K, F, C, U, O>,
    { initialFilters, ...settings }: IStructureCrudSettings<F>
) => {
    /**
     * A fresh copy of the initial filters: `filters` is edited in place by forms, so it must
     * never share objects with `initialFilters`.
     *
     * @returns the copy
     */
    const initialCopy = (): F => detachedCopy((initialFilters ?? {}) as F);

    /**
     * The live search filters, everything except pagination. Editing them does NOT run a search
     * (as-you-type vs on-submit is the screen's decision): change them, then call searchNow().
     */
    const filters = ref(initialCopy()) as Ref<F>;

    /** The search resource, reading `filters`. */
    const api = useStructureSearchApi<T, K, P, F>(() => filters.value, settings);

    /**
     * Runs `run` with the named operation, or rejects naming it when it was never supplied: a
     * rejection, not a throw, so it surfaces through the same `.catch` as a failed request.
     *
     * @param name - the operation
     * @param run - what to do with it
     * @returns what `run` resolves
     */
    const withOperation = <N extends 'list' | 'search' | 'get' | 'create' | 'update' | 'remove', R>(
        name: N,
        run: (operation: NonNullable<IStructureCrudOperations<T, K, F, C, U, O>[N]>) => Promise<R>
    ): Promise<R> => {
        const operation = operations[name];
        return operation
            ? run(operation as NonNullable<IStructureCrudOperations<T, K, F, C, U, O>[N]>)
            : Promise.reject(
                  new Error(`useStructureCrudApi - no "${name}" operation was supplied`)
              );
    };

    /**
     * The patch updateOne applies locally: optimisticPatch's, or the payload itself.
     *
     * @param data - the update payload
     * @returns the patch
     */
    const toPatch = (data: U): Partial<T> =>
        operations.optimisticPatch ? operations.optimisticPatch(data) : (data as Partial<T>);

    /**
     * Fetch every record.
     *
     * @param fetchSettings - forwarded to fetchAll (forced, staleTime, merge, ...)
     * @returns the records
     */
    const fetchList = (fetchSettings: IFetchSettings = {}) =>
        withOperation('list', (list) => api.fetchAll(list, fetchSettings));

    /**
     * Fetch one unfiltered page without touching the applied search: it goes through
     * fetchPaginate, and the total the search operation reports is discarded.
     *
     * @param page - page number
     * @param pageSize - page size
     * @param fetchSettings - forwarded to fetchPaginate
     * @returns the page's records
     */
    const fetchPage = (page = 1, pageSize = 10, fetchSettings: IFetchSettings = {}) =>
        withOperation('search', (search) =>
            api.fetchPaginate(
                (context) => search({} as F, page, pageSize, context).then(({ items }) => items),
                page,
                pageSize,
                fetchSettings
            )
        );

    /**
     * The active search: now (unless `immediate: false`), then on every page or page-size
     * change, invalidation or `dependsOn` change.
     *
     * @param watchSettings - forwarded to watchSearch; failures show in `error` and `onError`
     * @returns the watcher handle; its search() applies whatever `filters` now holds
     */
    const watchList = (watchSettings: IWatchSearchSettings<T, F> = {}) =>
        api.watchSearch(
            (currentFilters, page, pageSize, context) =>
                withOperation('search', (search) =>
                    search(currentFilters, page, pageSize, context)
                ),
            watchSettings
        );

    /**
     * Apply the current filters from page one: the "Search" button.
     *
     * @param fetchSettings - forwarded to fetchSearch
     * @returns the first page, with the search's total
     */
    const searchNow = (fetchSettings: IFetchSettings = {}) => {
        api.pageCurrent.value = 1;
        return withOperation('search', (search) =>
            api.fetchSearch(
                (context) => search(filters.value, 1, api.pageSize.value, context),
                filters.value,
                1,
                api.pageSize.value,
                fetchSettings
            )
        );
    };

    /**
     * Clear every filter and search again from page one. Forced: a reset asks for the truth, not
     * for the cache that produced the state being reset.
     *
     * @param fetchSettings - forwarded to fetchSearch
     * @returns the first page, with the search's total
     */
    const resetFilters = (fetchSettings: IFetchSettings = {}) => {
        filters.value = initialCopy();
        return searchNow({ forced: true, ...fetchSettings });
    };

    /**
     * Fetch one record and select it, so selectedRecord is what the screen shows. Selects up
     * front and undoes it on failure — unless another id was selected meanwhile — so a cached
     * record renders at once. Use fetchTarget to load a record without selecting it.
     *
     * @param id - the record id
     * @param fetchSettings - forwarded to fetchTarget (forced, merge, staleTime)
     * @returns the record
     */
    const fetchOne = (
        id: K,
        fetchSettings: Pick<IFetchSettings, 'forced' | 'merge' | 'staleTime'> = {}
    ) =>
        withOperation('get', (get) => {
            api.selectedIdentifier.value = id;
            return api
                .fetchTarget((context) => get(id, context), id, fetchSettings)
                .catch((error: unknown) => {
                    if (api.selectedIdentifier.value === id)
                        api.selectedIdentifier.value = undefined;
                    throw error;
                });
        });

    /**
     * fetchOne's active counterpart: selects and keeps fetched whatever id `idSource` produces.
     * A nullish id leaves the selection as it is.
     *
     * @param idSource - Ref, ComputedRef or getter producing the id
     * @param watchSettings - forwarded to watchTarget (forced, merge, staleTime, callbacks)
     * @returns the watcher handle
     */
    const watchOne = (
        idSource: WatchSource<K | undefined | null>,
        watchSettings: IWatchTargetSettings<T, K> = {}
    ) =>
        api.watchTarget(
            (id, context) => withOperation('get', (get) => get(id, context)),
            idSource,
            watchSettings
        );

    /**
     * Create a record and store it.
     *
     * @param data - the create payload
     * @param settings - requestOptions (forwarded to the operation) / dummyData / key
     * @returns the stored record
     */
    const createOne = (data: C, settings: ICreateOneSettings<T, O> = {}) =>
        withOperation('create', (create) =>
            api.createTarget(() => create(data, settings.requestOptions), settings.dummyData, {
                key: settings.key
            })
        );

    /**
     * Update a record: applied locally first, rolled back on failure.
     *
     * @param id - the record id
     * @param data - the update payload (see optimisticPatch for what reaches local state)
     * @param settings - requestOptions (forwarded to the operation) / merge / applyResponse / key
     * @returns the operation's result
     */
    const updateOne = (id: K, data: U, settings: IUpdateOneSettings<O> = {}) =>
        withOperation('update', (update) =>
            api.updateTarget(() => update(id, data, settings.requestOptions), toPatch(data), id, {
                merge: settings.merge,
                applyResponse: settings.applyResponse,
                key: settings.key
            })
        );

    /**
     * Delete a record: removed locally first, restored on failure.
     *
     * @param id - the record id
     * @param settings - requestOptions (forwarded to the operation) / key
     * @returns the operation's result
     */
    const deleteOne = (id: K, settings: IDeleteOneSettings<O> = {}) =>
        withOperation('remove', (remove) =>
            api.deleteTarget(() => remove(id, settings.requestOptions), id, { key: settings.key })
        );

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

/** Everything {@link useStructureCrudApi} returns. */
export type IStructureCrudApi<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string | number, any> = Record<string, any>,
    K extends string | number = TIdOf<T>,
    F = object,
    C = Partial<T>,
    U = Partial<T>,
    O = unknown,
    P extends string | number = string | number
> = ReturnType<typeof useStructureCrudApi<T, K, F, C, U, O, P>>;
