/**
 * How a resource stores what the server answered: one record, a server-returned record that may
 * have been asked for by an alias, or a whole fetched batch.
 *
 * A server-returned record always lives under its OWN id; the address it was requested by, if
 * different (a slug), becomes a pointer (`ITargetEntry.aliasOf`), never a second copy. A batch is
 * stored only while its query was not cancelled and its scope is still claimed by a live
 * instance, and first enforces `maxRecords` — sparing whatever is on screen.
 *
 * @module internal/resourceWrites
 * @see docs/composables/structure-rest-api.md
 */
import type { Query, QueryClient, QueryKey } from '@tanstack/vue-query';
import type { IFetchSettings } from '../composables/structureRestApi.js';
import { isNil } from './plainData.js';
import { readIdentifier } from './identifierJoin.js';
import {
    LIST_KINDS,
    idOf,
    kindOf,
    type IListCacheEntry,
    type IResourceKeys,
    type ITargetEntry
} from './resourceKeys.js';
import { canWrite } from './recordMutations.js';
import type { IQueryRecordStore } from './queryRecordStore.js';
import type { TInLiveScope } from './liveScope.js';
import { dropQueries } from './queryRemoval.js';
import type { IRunningQuery } from './runningQuery.js';

/** How a fetched item is written: merged, partial (merged, freshness kept), or replacing. */
export type TStoreSettings = Pick<IFetchSettings, 'merge' | 'partial'>;

/** What the writes need from the resource that owns them. */
export interface IResourceWritesContext<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- record constraint: unknown rejects interfaces without an index signature
    T extends Record<string | number, any>,
    K extends string | number
> {
    /** The one cache. */
    queryClient: QueryClient;

    /** First key segment of every query of this resource. */
    resourceKey: string;

    /** The resource's key layout and scope predicates. */
    keys: IResourceKeys;

    /** The record store: fetched writes and scoped reads. */
    store: IQueryRecordStore<T, K>;

    /** Runs a late write only while its scope is still claimed by a live instance. */
    inLiveScope: TInLiveScope;

    /** Upper bound on cached records per scope; 0 disables it. */
    maxRecords: number;

    /** The identifier field(s), and the delimiter joining several. */
    identity: { identifiers: string | string[]; delimiter: string };

    /** The record operations the writes go through. */
    records: {
        /** The id of a record, fabricated when missing. */
        createIdentifier: (item: T) => K;

        /** Stores a record, replacing any with the same id. */
        addRecord: (item: T) => T;

        /** Merges fields into a record (creating it when asked). */
        editRecord: (data: Partial<T>, id?: K, create?: boolean) => K | undefined;
    };
}

/**
 * The writes of one resource.
 *
 * @param context - see IResourceWritesContext
 * @returns storeItem, storeServerRecord, storeBatch, enforceMaxRecords
 */
export const createResourceWrites = <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- record constraint: unknown rejects interfaces without an index signature
    T extends Record<string | number, any>,
    K extends string | number
>({
    queryClient,
    resourceKey,
    keys,
    store,
    inLiveScope,
    maxRecords,
    identity,
    records
}: IResourceWritesContext<T, K>) => {
    /** The record operations, by name. */
    const { createIdentifier, addRecord, editRecord } = records;

    /**
     * Stores one fetched item. `partial`: merge and keep the record's freshness. `merge`: merge.
     * Otherwise the item replaces the record. With `readAt`, the write is a read's: skipped once
     * a mutation on `id` owns the record (see `recordMutations.ts`'s `canWrite`).
     *
     * @param item - the fetched item
     * @param id - its id
     * @param settings - merge / partial
     * @param scope - the scope this write belongs to
     * @param readAt - the clock value the read captured when it began; omitted for a mutation's
     *                 own write, which is never guarded
     */
    const storeItem = (
        item: T,
        id: K,
        { merge = false, partial = false }: TStoreSettings = {},
        scope: unknown[],
        readAt?: number
    ): void => {
        if (readAt !== undefined && !canWrite(queryClient, resourceKey, id, scope, readAt)) return;
        if (partial) store.asFetched(() => editRecord(item, id, true), { fresh: false });
        else if (merge) store.asFetched(() => editRecord(item, id, true));
        else store.asFetched(() => addRecord(item));
    };

    /**
     * Stores a record the server returned, under its own id. A known `requestedId` is trusted
     * over a response that carries no id of its own (an acknowledgement, a partial merge); only a
     * create (no `requestedId`) falls back to `createIdentifier`'s fabricated id. When the
     * response's own id differs from `requestedId` (a slug), `requestedId` becomes a pointer.
     * Call inside `store.forScope(scope, ...)`, so `storeItem`'s writes address `scope` too.
     *
     * @param item - the record, as the server returned it
     * @param requestedId - the (resolved) id it was addressed by; omit for a create
     * @param scope - the scope this write belongs to
     * @param settings - merge / partial
     * @param readAt - the clock value a READ captured when it began; omitted for a mutation
     * @returns the entry `requestedId`'s own key now holds: the record, or an alias entry
     */
    const storeServerRecord = (
        item: T,
        requestedId: K | undefined,
        scope: unknown[],
        settings: TStoreSettings,
        readAt?: number
    ): ITargetEntry<T> => {
        const ownId = readIdentifier(item, identity.identifiers, identity.delimiter) as
            K | undefined;
        const realId = requestedId === undefined ? createIdentifier(item) : (ownId ?? requestedId);
        storeItem(item, realId, settings, scope, readAt);
        // String(): keys.target() keys every id as a string, so '1' and 1 are the SAME entry —
        // a raw comparison would alias an entry to itself, overwriting its own record.
        if (requestedId === undefined || String(requestedId) === String(realId))
            return (
                queryClient.getQueryData<ITargetEntry<T>>(keys.target(realId, scope)) ?? {
                    data: item
                }
            );
        const aliasEntry: ITargetEntry<T> = { aliasOf: String(realId) };
        queryClient.setQueryData<ITargetEntry<T>>(keys.target(requestedId, scope), aliasEntry);
        return aliasEntry;
    };

    /**
     * Ids of what is on screen under `scope`, straight from the cache: a watched list's rows and
     * the record behind a watched alias. Neither has an observer of its own, so `maxRecords` must
     * be told to spare them — else a watched list points at ids that resolve to nothing, with
     * nothing telling it to refetch.
     *
     * @param scoped - every query of the scope
     * @returns the protected record ids, as strings
     */
    const onScreenIds = (scoped: readonly Query[]): Set<string> => {
        const ids = new Set<string>();
        for (const query of scoped) {
            if (query.getObserversCount() === 0) continue;
            const kind = kindOf(query.queryKey);
            const listIds = LIST_KINDS.includes(kind)
                ? ((query.state.data as IListCacheEntry<K> | undefined)?.ids ?? [])
                : [];
            for (const id of listIds) ids.add(String(id));
            const aliasOf = (query.state.data as ITargetEntry<T> | undefined)?.aliasOf;
            if (kind === 'target' && aliasOf !== undefined) ids.add(aliasOf);
        }
        return ids;
    };

    /**
     * Past `maxRecords`, removes every query of `scope` except `keep` (the call writing right
     * now), the ones still fetching, the ones actively watched, and the records on screen (see
     * onScreenIds). Those still count toward the bound; they are just never evicted.
     *
     * @param incoming - how many records not cached yet are about to be written
     * @param keep - key of the query writing them
     * @param scope - the scope the writing query belongs to
     */
    const enforceMaxRecords = (incoming: number, keep: QueryKey, scope: unknown[]): void => {
        if (maxRecords <= 0) return;
        const inScope = keys.inScope(scope);
        const scoped = queryClient.getQueryCache().findAll({ predicate: inScope });
        // An alias entry holds no record of its own: it never counts toward the bound.
        const cached = scoped.filter(
            (query) =>
                kindOf(query.queryKey) === 'target' &&
                (query.state.data as ITargetEntry<T> | undefined)?.data !== undefined
        );
        if (cached.length + incoming <= maxRecords) return;
        const kept = queryClient.getQueryCache().find({ queryKey: keep, exact: true });
        const protectedIds = onScreenIds(scoped);
        dropQueries(
            queryClient,
            (query) =>
                inScope(query) &&
                query !== kept &&
                query.state.fetchStatus !== 'fetching' &&
                query.getObserversCount() === 0 &&
                !(
                    kindOf(query.queryKey) === 'target' &&
                    protectedIds.has(idOf(query.queryKey) as string)
                )
        );
    };

    /**
     * Stores a fetched batch under the scope it was asked in (the running query's own, not
     * whatever `dependsOn()` reads now). Stores nothing once the query was cancelled or nothing
     * claims `scope` any more: a late answer for an abandoned scope has nowhere to land.
     *
     * @param items - the fetched items; empty slots are skipped
     * @param scope - the scope the running query belongs to
     * @param running - the query writing them (kept through a `maxRecords` wipe)
     * @param settings - merge / partial
     * @param readAt - the clock value the read captured when it began
     * @returns the stored ids, in order
     */
    const storeBatch = (
        items: (T | undefined)[] = [],
        scope: unknown[],
        running: IRunningQuery,
        settings: TStoreSettings,
        readAt: number
    ): K[] => {
        if (running.isCancelled()) return [];
        return inLiveScope(scope, () => {
            const present = items.filter((item): item is T => !isNil(item));
            /** Whether `item`'s record is already cached under `scope`. */
            const isCached = (item: T): boolean => {
                const key = keys.target(createIdentifier(item), scope);
                return !isNil(queryClient.getQueryData<ITargetEntry<T>>(key)?.data);
            };
            // Only records not cached yet grow the cache: a refetch of the same list adds nothing.
            const added = present.filter((item) => !isCached(item));
            enforceMaxRecords(added.length, running.queryKey, scope);
            return present.map((item) => {
                const id = createIdentifier(item);
                storeItem(item, id, settings, scope, readAt);
                return id;
            });
        }, []);
    };

    return { storeItem, storeServerRecord, storeBatch, enforceMaxRecords };
};
