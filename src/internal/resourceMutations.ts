/**
 * A resource's writes: optimistic create / update / delete with rollback, and free-form
 * commands, each run as a one-shot TanStack mutation so `isLoading` sees it.
 *
 * Update and delete share one optimistic protocol: cancel the record's own in-flight read, snapshot
 * the record and apply the change locally, send the request; then store the result, or put the
 * record back — only if it still holds this call's change, so a failed older call never undoes a
 * newer one. The snapshot is taken right before applying, not at call start, so a same-tick sibling
 * mutation on the same id rolls back to what THIS call left behind, never to a shared, older
 * "before either of us ran" value. Whenever a rollback runs, or a success is skipped because a
 * newer mutation now owns the record, that record is invalidated so an active watcher reconciles it
 * with the server instead of trusting the local guess. A list read of the scope is never cancelled:
 * it is left to run, and the write guard (see `./writeGuard`) keeps its answer from overwriting this
 * id once it lands, so every id it holds besides this one still gets stored normally. Every local
 * write checks the `dependsOn` snapshot the call started under and is dropped after a scope change.
 * Once the request settles, success or failure, the scope's lists are marked stale.
 *
 * @module internal/resourceMutations
 */
import { toRaw } from 'vue';
import { MutationObserver, type QueryClient } from '@tanstack/vue-query';
import { getUuid } from '@guebbit/js-toolkit';
import type { IFetchSettings, IUpdateTargetSettings } from '../composables/structureRestApi.js';
import type { IQueryRecordStore, IRecordSnapshot } from './queryRecordStore.js';
import { LIST_KINDS, type IResourceKeys } from './resourceKeys.js';
import { isNil } from './plainData.js';
import type { IWriteGuard } from './writeGuard.js';

/** The record operations the mutations write through. */
export interface IRecordOperations<T, K> {
    /** The id of a record. */
    createIdentifier: (item: T) => K;

    /** One record, if stored. */
    getRecord: (id: K) => T | undefined;

    /** Stores a record, replacing any with the same id. */
    addRecord: (item: T) => T;

    /** Merges fields into a record (creating it when asked). */
    editRecord: (data: Partial<T>, id?: K, create?: boolean) => K | undefined;

    /** Removes a record. */
    deleteRecord: (id: K) => boolean | undefined;
}

/** What the mutations need from the resource that owns them. */
export interface IResourceMutationsContext<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string | number, any>,
    K extends string | number
> {
    /** The client the mutations run on. */
    queryClient: QueryClient;

    /** First key segment of every mutation. */
    resourceKey: string;

    /** The resource's key layout and scope predicates. */
    keys: IResourceKeys;

    /** Reads the current scope snapshot. */
    dependsOn: () => unknown[];

    /** The resource's record operations. */
    records: IRecordOperations<T, K>;

    /** The record store: fetched writes, snapshots and exact restores. */
    store: IQueryRecordStore<T, K>;

    /**
     * Stores one fetched item, honouring merge / partial. Called here with no `readAt`: a
     * mutation's own write is never guarded — it is already gated by `runOptimistic`'s own
     * `written` check (see below), and `beginMutation` marks the id in the write guard directly.
     */
    storeItem: (item: T, id: K, settings: Pick<IFetchSettings, 'merge' | 'partial'>) => void;

    /** Read/mutation write ordering (see ./writeGuard); marks this id owned while the call runs. */
    writeGuard: IWriteGuard<K>;
}

/**
 * The writes of one resource.
 *
 * @param context - see IResourceMutationsContext
 * @returns mutateAny, createTarget, updateTarget, deleteTarget
 */
export const createResourceMutations = <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string | number, any>,
    K extends string | number
>({
    queryClient,
    resourceKey,
    keys,
    dependsOn,
    records,
    store,
    storeItem,
    writeGuard
}: IResourceMutationsContext<T, K>) => {
    /** The record operations, by name. */
    const { createIdentifier, getRecord, addRecord, editRecord, deleteRecord } = records;

    /**
     * Runs apiCall as a one-shot TanStack mutation, so `isLoading` sees it.
     *
     * @param operation - key segments after `resourceKey` (what `useIsLoading` sees)
     * @param apiCall - the request
     * @param key - the caller's key, which `isLoading(key)` matches
     * @returns the apiCall's result
     */
    const runMutation = <R>(
        operation: unknown[],
        apiCall: () => Promise<R>,
        key?: string[]
    ): Promise<R> => {
        // TanStack generics: result, error, variables (none: apiCall closes over its inputs).
        const observer = new MutationObserver<R, unknown, void>(queryClient, {
            mutationKey: [resourceKey, ...operation],
            mutationFn: apiCall,
            meta: { key } // what isLoading(key) matches
        });
        // reset() once settled: an observed mutation is never garbage-collected.
        return observer.mutate().finally(() => observer.reset());
    };

    /**
     * Marks this resource's lists under `scope` stale; active ones refetch. Nothing waits for
     * those refetches: callers fire and forget.
     *
     * @param scope - the `dependsOn` snapshot whose lists changed
     */
    const invalidateLists = (scope: unknown[]): void =>
        void queryClient.invalidateQueries({ predicate: keys.inScope(scope, LIST_KINDS) });

    /**
     * Marks record `id` stale and, if something is actively watching it, has it refetch. Called
     * after a rollback or a skipped success: what is left stored (the pre-change snapshot, or
     * whatever a newer mutation applied) is a local guess, not a server-confirmed value, so it
     * asks the server to reconcile it instead of leaving the guess marked fresh.
     *
     * @param id - the record id
     * @param scope - the scope the change ran under
     */
    const invalidateRecord = (id: K, scope: unknown[]): void =>
        void queryClient.invalidateQueries({
            queryKey: keys.target(id, scope),
            exact: true,
            refetchType: 'active'
        });

    /**
     * Cancels record `id`'s own in-flight read, so it never lands an older answer over the
     * change. A list read of the scope is left running (see the module header).
     *
     * @param id - the record id
     * @param scope - the scope the change runs under
     * @returns settles once the query is cancelled
     */
    const cancelReads = (id: K, scope: unknown[]): Promise<unknown> =>
        queryClient.cancelQueries({ queryKey: keys.target(id, scope), exact: true });

    /**
     * The raw record stored under `id` right now.
     *
     * @param id - the record id
     * @returns the raw record, if stored
     */
    const rawRecord = (id: K): T | undefined => {
        const record = getRecord(id);
        return record === undefined ? undefined : toRaw(record);
    };

    /**
     * Puts a record back after a failed change, only if it still holds what this call wrote: a
     * newer change owns the record, and a failed older call leaves it alone.
     *
     * @param id - the record id
     * @param previous - the record before the change
     * @param written - what the change left stored
     */
    const rollback = (
        id: K,
        previous: IRecordSnapshot<T> | undefined,
        written: T | undefined
    ): void => {
        if (rawRecord(id) !== written) return;
        if (previous) store.restore(id, previous);
        else deleteRecord(id);
    };

    /**
     * The optimistic protocol update and delete share (see the module header).
     *
     * @param id - the record changed
     * @param apply - the local change
     * @param request - the server call
     * @param onSuccess - stores the result, under the scope the call started in only
     * @returns the request's result
     */
    const runOptimistic = <R>(
        id: K,
        apply: () => unknown,
        request: () => Promise<R>,
        onSuccess?: (result: R) => void
    ): Promise<R> => {
        const scopeAtStart = dependsOn();
        let previous: IRecordSnapshot<T> | undefined;
        let written: T | undefined;
        // Marks `id` owned for the whole call: a read of it in flight now, or started before this
        // settles, must not land its answer over what this call is about to do (see ./writeGuard).
        const settleGuard = writeGuard.beginMutation(id);
        return cancelReads(id, scopeAtStart)
            .then(() => {
                if (keys.isCurrent(scopeAtStart)) {
                    // Captured now, not at call start: a same-tick mutation on this id may already
                    // have applied its own change by the time cancelReads resolves, and a failure
                    // here must roll back to THAT, not to what the record held before either call
                    // began (which a same-tick sibling would have captured too).
                    previous = store.snapshot(id);
                    apply();
                    written = rawRecord(id);
                }
                return request();
            })
            .then(
                (result) => {
                    if (!keys.isCurrent(scopeAtStart)) return result;
                    // A success is a write too: only apply it while the record still holds exactly
                    // what this call's own optimistic apply left it as. A newer mutation on the
                    // same id (a delete, another update) has since changed or removed it, and this
                    // call's answer is now stale — applying it would resurrect what the newer
                    // mutation just did, undoing it the same way a stale rollback would.
                    if (rawRecord(id) === written) onSuccess?.(result);
                    else invalidateRecord(id, scopeAtStart);
                    invalidateLists(scopeAtStart);
                    return result;
                },
                (error: unknown) => {
                    if (keys.isCurrent(scopeAtStart)) {
                        // Read before rollback runs: a newer mutation already owning the record
                        // (rollback's own guard, below) means there is nothing of THIS call's to
                        // reconcile — the newer one's outcome stands, confirmed or not yet.
                        const owned = rawRecord(id) === written;
                        rollback(id, previous, written);
                        if (owned) invalidateRecord(id, scopeAtStart);
                        invalidateLists(scopeAtStart);
                    }
                    throw error;
                }
            )
            .finally(settleGuard);
    };

    /**
     * A command that fits no record shape, run as a one-shot mutation. Invalidates nothing: it
     * has no defined relationship to any record or list (invalidate through `queryClient`).
     *
     * @param apiCall - the request
     * @param settings - key
     * @returns the apiCall's result
     */
    const mutateAny = <F = unknown>(
        apiCall: () => Promise<F>,
        { key }: Pick<IFetchSettings, 'key'> = {}
    ): Promise<F> => runMutation(['any'], apiCall, key);

    /**
     * Create a record and store it. `dummyData`, if given, renders at once under a temporary id
     * while the request runs, and is replaced by the real record (or removed on failure). Once
     * the request succeeds the scope's lists are marked stale, whatever it resolved.
     *
     * @param apiCall - resolves the created record
     * @param dummyData - placeholder shown while the request runs
     * @param settings - key
     * @returns the stored record
     */
    const createTarget = (
        apiCall: () => Promise<T | undefined>,
        dummyData?: T,
        { key }: Pick<IFetchSettings, 'key'> = {}
    ): Promise<T | undefined> => {
        const temporaryId = getUuid() as K;
        const scopeAtStart = dependsOn();
        if (dummyData) editRecord(dummyData, temporaryId, true);
        return runMutation(['create'], apiCall, key).then(
            (item) => {
                if (dummyData) deleteRecord(temporaryId);
                if (!keys.isCurrent(scopeAtStart)) return item;
                invalidateLists(scopeAtStart);
                if (isNil(item)) return item;
                store.asFetched(() => addRecord(item));
                return getRecord(createIdentifier(item));
            },
            (error: unknown) => {
                if (dummyData) deleteRecord(temporaryId);
                throw error;
            }
        );
    };

    /**
     * Stores a successful update's response as the record — unless `applyResponse` is off, or
     * the response is not a record (empty, an array, an acknowledgement): the optimistic patch
     * then stays.
     *
     * @param data - the response
     * @param id - the id updateTarget was given, if any
     * @param settings - merge / applyResponse
     */
    const applyUpdateResponse = (
        data: unknown,
        id: K | undefined,
        { merge = false, applyResponse = true }: IUpdateTargetSettings
    ): void => {
        if (!applyResponse || typeof data !== 'object' || data === null || Array.isArray(data))
            return;
        storeItem(data as T, id ?? createIdentifier(data as T), { merge });
    };

    /**
     * Update a record: applied locally first, rolled back on failure (see the module header).
     * Success stores the response (see `applyResponse`).
     *
     * @param apiCall - the request
     * @param itemData - the change applied optimistically
     * @param id - the record id; inferred from itemData when omitted (with multiple identifiers,
     *             build it with createIdentifier)
     * @param settings - merge / key / applyResponse
     * @returns the apiCall's result
     */
    const updateTarget = <F = T>(
        apiCall: () => Promise<F>,
        itemData: Partial<T>,
        id?: K,
        settings: IUpdateTargetSettings = {}
    ): Promise<F> => {
        const targetId = id ?? createIdentifier(itemData as T);
        return runOptimistic(
            targetId,
            () => editRecord(itemData, targetId, true),
            () => runMutation(['update', targetId], apiCall, settings.key),
            (data) => applyUpdateResponse(data, id, settings)
        );
    };

    /**
     * Delete a record: removed locally first, restored on failure (see the module header).
     *
     * @param apiCall - the request
     * @param id - the record id (with multiple identifiers, build it with createIdentifier)
     * @param settings - key
     * @returns the apiCall's result
     */
    const deleteTarget = <F = unknown>(
        apiCall: () => Promise<F>,
        id: K,
        { key }: Pick<IFetchSettings, 'key'> = {}
    ): Promise<F> =>
        runOptimistic(
            id,
            () => deleteRecord(id),
            () => runMutation(['delete', id], apiCall, key)
        );

    return { mutateAny, createTarget, updateTarget, deleteTarget };
};
