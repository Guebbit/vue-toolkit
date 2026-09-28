/**
 * A resource's records stored as TanStack queries, one query per record, behind the
 * `IRecordStore` seam that `useStructureDataManagement` writes through.
 *
 * The dictionary is a read-only view rebuilt from the cache, current `dependsOn` scope only.
 * Freshness is TanStack's own `dataUpdatedAt`: a write made inside `asFetched` (a server answer)
 * is stamped "now"; any other write is a local guess (optimistic edit, partial data, manual
 * write) and keeps the previous stamp — or 0, stale, when the record is new.
 *
 * `write`/`read`/`remove`/`snapshot`/`restore`/`resolve` address the current `dependsOn()` by
 * default, or whatever scope `forScope` has active — a late answer's write belongs to the scope
 * it was fetched for, not whatever is current by the time it lands (see restResource.ts's module
 * header). The seam methods (`IRecordStore`) called through `records` — `editRecord`/`addRecord`/
 * `deleteRecord` — route through `write`/`read`/`remove` and so respect it too.
 *
 * @module internal/queryRecordStore
 */
import { computed, readonly, type Ref } from 'vue';
import type { QueryClient } from '@tanstack/vue-query';
import type { IRecordStore } from '../composables/structureDataManagement.js';
import { LIST_KINDS, type IResourceKeys, type ITargetEntry } from './resourceKeys.js';
import { dropQueries } from './queryRemoval.js';
import { isNil } from './plainData.js';

/** What the record store needs from the resource that owns it. */
export interface IQueryRecordStoreContext {
    /** The client the records live on. */
    queryClient: QueryClient;

    /** The resource's key layout and scope predicates. */
    keys: IResourceKeys;

    /** Reads the current scope snapshot. */
    dependsOn: () => unknown[];

    /** Moves when a record gets new data or leaves the cache. */
    version: Readonly<Ref<number>>;
}

/** A record as it stood before an optimistic change: enough to put it back exactly. */
export interface IRecordSnapshot<T> {
    /** The raw record. */
    item: T;

    /** Its freshness stamp. */
    updatedAt: number;

    /** Whether it was invalidated. */
    isInvalidated: boolean;
}

/** The record store, plus what the REST layer needs beyond the seam. */
export interface IQueryRecordStore<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string | number, any>,
    K extends string | number
> extends IRecordStore<T, K> {
    /** Runs `write` calls made inside `run` as server answers: they count as fresh. */
    asFetched: <R>(run: () => R) => R;

    /**
     * Runs `run` with every key this store builds (`write`, `read`, `remove`, `snapshot`,
     * `restore`, `resolve`) addressing `scope` instead of the current `dependsOn()`. For a late
     * answer whose fetch started under a scope `dependsOn` has since moved past, but that another
     * instance (or the scope registry) still claims — see A4 in `restResource.ts`'s module header.
     */
    forScope: <R>(scope: unknown[], run: () => R) => R;

    /** True while `asFetched` runs (see IRecordStore.isFetching). */
    isFetching: () => boolean;

    /** A record as it stands now, for putting it back later. */
    snapshot: (id: K) => IRecordSnapshot<T> | undefined;

    /** Puts a record back exactly as snapshotted, freshness included. */
    restore: (id: K, snapshot: IRecordSnapshot<T>) => void;

    /** Follows `id` to the one its record actually lives under, one hop (see IRecordStore). */
    resolve: (id: K) => K;

    /** One record by id, O(1) (see IRecordStore). */
    read: (id: K) => T | undefined;
}

/**
 * Record store over a `QueryClient`.
 *
 * @param context - see IQueryRecordStoreContext
 * @returns the store
 */
export const createQueryRecordStore = <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string | number, any>,
    K extends string | number
>({
    queryClient,
    keys,
    dependsOn,
    version
}: IQueryRecordStoreContext): IQueryRecordStore<T, K> => {
    /**
     * Every record cached under the current scope, rebuilt when a record changes. `readonly()` on
     * the object, not the computed: a record changes through the store, never in place, and the
     * computed stays an ordinary `ComputedRef` for Pinia to unwrap. An answer of `null` is no
     * record.
     */
    const dictionary = computed<Record<K, T>>(() => {
        void version.value;
        const result = {} as Record<K, T>;
        const current = keys.inScope(dependsOn(), ['target']);
        for (const query of queryClient.getQueryCache().findAll({ predicate: current })) {
            const record = (query.state.data as ITargetEntry<T> | undefined)?.data;
            if (!isNil(record)) result[query.queryKey[3] as K] = record;
        }
        return readonly(result) as Record<K, T>;
    });

    /** True while `asFetched` runs: writes are server answers. */
    let fetched = false;

    /**
     * Runs `run` with its writes counted as server answers.
     *
     * @param run - the writes
     * @returns what `run` returns
     */
    const asFetched = <R>(run: () => R): R => {
        const outer = fetched;
        fetched = true;
        try {
            return run();
        } finally {
            fetched = outer;
        }
    };

    /** Active `forScope` override, if any. */
    let scopeOverride: unknown[] | undefined;

    /** The scope this store's key-building addresses right now (see `forScope`). */
    const currentScope = (): unknown[] => scopeOverride ?? dependsOn();

    /**
     * Runs `run` addressing `scope` instead of the current `dependsOn()` (see IQueryRecordStore).
     *
     * @param scope - the scope to address
     * @param run - the reads/writes to run under it
     * @returns what `run` returns
     */
    const forScope = <R>(scope: unknown[], run: () => R): R => {
        const outer = scopeOverride;
        scopeOverride = scope;
        try {
            return run();
        } finally {
            scopeOverride = outer;
        }
    };

    /**
     * Follows `id` to the one its record actually lives under (see IQueryRecordStore.resolve): an
     * alias entry (fetched by an alternate key — `targetQueryFunction` in restResource.ts) holds
     * `aliasOf` instead of `data`. Any other id, including one with no entry at all, is its own.
     * Reads the RAW (unresolved) key directly, never through `keyOf`: resolving what it is itself
     * about to resolve would be circular.
     */
    const resolve = (id: K): K => {
        const entry = queryClient.getQueryData<ITargetEntry<T>>(keys.target(id, currentScope()));
        return (entry?.aliasOf as K | undefined) ?? id;
    };

    /**
     * The key `id`'s record actually lives under — `id` resolved one hop, then keyed. Every
     * read/write below goes through this, so an alias (`'my-slug'`) reaches the same entry its
     * real id does, instead of writing (or reading) a second, divergent one under the alias
     * itself — see A2 in restResource.ts's module header.
     *
     * @param id - the record id, an alias included
     * @returns the real record's key
     */
    const keyOf = (id: K): unknown[] => keys.target(resolve(id), currentScope());

    /**
     * Marks one record stale without fetching it.
     *
     * @param id - the record id
     */
    const invalidate = (id: K): void =>
        // refetchType 'none': settles at once and fetches nothing, so there is nothing to await.
        void queryClient.invalidateQueries({
            queryKey: keyOf(id),
            exact: true,
            refetchType: 'none'
        });

    /**
     * One record by id, straight off the query cache: O(1), unlike reading through `dictionary`
     * (see IRecordStore.read).
     *
     * @param id - the record id
     * @returns the record, if cached
     */
    const read = (id: K): T | undefined =>
        queryClient.getQueryData<ITargetEntry<T>>(keyOf(id))?.data;

    /**
     * Stores one record under the current scope.
     *
     * @param id - the record id
     * @param item - the record
     */
    const write = (id: K, item: T): void => {
        const key = keyOf(id);
        const previous = queryClient.getQueryState(key);
        queryClient.setQueryData<ITargetEntry<T>>(
            key,
            { data: item },
            // TanStack measures staleness from `updatedAt`; 0 reads as stale.
            { updatedAt: fetched ? Date.now() : (previous?.dataUpdatedAt ?? 0) }
        );
        // setQueryData also clears TanStack's "invalidated" flag: a guess must not undo it.
        if (!fetched && previous?.isInvalidated) invalidate(id);
    };

    /**
     * Removes one record AND every pointer to it (an alias fetched by an alternate key) — a
     * pointer left behind, still cached and fresh, would otherwise go on serving "nothing" for
     * its own key instead of asking the server again. A watcher on either the record or a pointer
     * is emptied in place, not removed (see queryRemoval).
     *
     * @param id - the record id, an alias included
     */
    const remove = (id: K): void =>
        dropQueries(queryClient, keys.refersTo(resolve(id), currentScope()));

    /**
     * Drops every record of the current scope (observed ones emptied in place), and marks the
     * scope's lists stale: their ids may now point at nothing, so the next read asks the server.
     *
     * @param refetch - have active list watchers fetch again right away
     */
    const dropAll = (refetch: boolean): void => {
        const scope = dependsOn();
        dropQueries(queryClient, keys.inScope(scope, ['target']));
        // Nothing waits for the refetches this may start; TanStack catches their failures.
        void queryClient.invalidateQueries({
            predicate: keys.inScope(scope, LIST_KINDS),
            refetchType: refetch ? 'active' : 'none'
        });
    };

    /** Empties the record view; watched lists fetch their records again. */
    const clear = (): void => dropAll(true);

    /**
     * Replaces every record of the current scope; none of them counts as fetched. Lists are only
     * marked stale: refetching them now would overwrite what was just set.
     *
     * @param items - the new records, by id
     */
    const writeAll = (items: Record<K, T>): void => {
        dropAll(false);
        for (const id of Object.keys(items) as K[]) write(id, items[id]);
    };

    /**
     * A record as it stands now.
     *
     * @param id - the record id
     * @returns its snapshot, if cached
     */
    const snapshot = (id: K): IRecordSnapshot<T> | undefined => {
        const state = queryClient.getQueryState<ITargetEntry<T>>(keyOf(id));
        const item = state?.data?.data;
        if (state === undefined || isNil(item)) return undefined;
        return { item, updatedAt: state.dataUpdatedAt, isInvalidated: state.isInvalidated };
    };

    /**
     * Puts a record back exactly as snapshotted.
     *
     * @param id - the record id
     * @param saved - its snapshot
     */
    const restore = (id: K, saved: IRecordSnapshot<T>): void => {
        queryClient.setQueryData<ITargetEntry<T>>(
            keyOf(id),
            { data: saved.item },
            { updatedAt: saved.updatedAt } // the freshness it had, not "now"
        );
        if (saved.isInvalidated) invalidate(id);
    };

    /** True while `asFetched` runs. */
    const isFetching = (): boolean => fetched;

    return {
        dictionary,
        write,
        remove,
        writeAll,
        clear,
        asFetched,
        forScope,
        isFetching,
        snapshot,
        restore,
        resolve,
        read
    };
};
