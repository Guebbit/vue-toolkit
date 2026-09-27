/**
 * A resource's records stored as TanStack queries, one query per record, behind the
 * `IRecordStore` seam that `useStructureDataManagement` writes through.
 *
 * The dictionary is a read-only view rebuilt from the cache, current `dependsOn` scope only.
 * Freshness is TanStack's own `dataUpdatedAt`: a write made inside `asFetched` (a server answer)
 * is stamped "now"; any other write is a local guess (optimistic edit, partial data, manual
 * write) and keeps the previous stamp — or 0, stale, when the record is new.
 *
 * @module internal/queryRecordStore
 */
import { computed, readonly, type Ref } from 'vue';
import type { QueryClient } from '@tanstack/vue-query';
import type { IRecordStore } from '../composables/structureDataManagement';
import { LIST_KINDS, type IResourceKeys, type ITargetEntry } from './resourceKeys';
import { dropQueries, dropQuery } from './queryRemoval';
import { isNil } from './plainData';

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

    /** A record as it stands now, for putting it back later. */
    snapshot: (id: K) => IRecordSnapshot<T> | undefined;

    /** Puts a record back exactly as snapshotted, freshness included. */
    restore: (id: K, snapshot: IRecordSnapshot<T>) => void;
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
        const result = run();
        fetched = outer;
        return result;
    };

    /**
     * Marks one record stale without fetching it.
     *
     * @param id - the record id
     */
    const invalidate = (id: K): void =>
        // refetchType 'none': settles at once and fetches nothing, so there is nothing to await.
        void queryClient.invalidateQueries({
            queryKey: keys.target(id),
            exact: true,
            refetchType: 'none'
        });

    /**
     * Stores one record under the current scope.
     *
     * @param id - the record id
     * @param item - the record
     */
    const write = (id: K, item: T): void => {
        const key = keys.target(id);
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
     * Removes one record. A record a watcher observes is emptied in place (see queryRemoval).
     *
     * @param id - the record id
     */
    const remove = (id: K): void => dropQuery(queryClient, keys.target(id));

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
        const state = queryClient.getQueryState<ITargetEntry<T>>(keys.target(id));
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
            keys.target(id),
            { data: saved.item },
            { updatedAt: saved.updatedAt } // the freshness it had, not "now"
        );
        if (saved.isInvalidated) invalidate(id);
    };

    return { dictionary, write, remove, writeAll, clear, asFetched, snapshot, restore };
};
