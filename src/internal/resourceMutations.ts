/**
 * A resource's writes: optimistic create / update / delete with rollback, and free-form commands,
 * each a one-shot TanStack `MutationObserver`, so `isLoading` sees it.
 *
 * Update and delete share one protocol on the observer's lifecycle (see `runOptimistic`):
 * `onMutate` cancels the record's reads, snapshots it and applies the change; `onSuccess` stores
 * the answer, `onError` rolls back — each only while the record still holds THIS call's own
 * change, so an older call never undoes a newer one. A read asks TanStack's `MutationCache`
 * whether a mutation owns a record before storing it (`recordMutations.ts`'s `canWrite`). Every
 * local write runs under the scope the call started in.
 *
 * @module internal/resourceMutations
 * @see docs/composables/structure-rest-api.md
 */
import { toRaw } from 'vue';
import { MutationObserver, type QueryClient } from '@tanstack/vue-query';
import { getUuid } from '@guebbit/js-toolkit';
import type { IFetchSettings, IUpdateTargetSettings } from '../composables/structureRestApi.js';
import type { IQueryRecordStore, IRecordSnapshot } from './queryRecordStore.js';
import type { IResourceKeys, ITargetEntry } from './resourceKeys.js';
import { createResourceInvalidation } from './resourceInvalidation.js';
import { isNil } from './plainData.js';
import type { TInLiveScope } from './liveScope.js';
import type { IScopeRegistry } from './scopeRegistry.js';
import type { IRecordMutationMeta } from './recordMutations.js';

/** The record operations the mutations write through. */
export interface IRecordOperations<T, K> {
    /** The id of a record. */
    createIdentifier: (item: T) => K;

    /** Merges fields into a record (creating it when asked). */
    editRecord: (data: Partial<T>, id?: K, create?: boolean) => K | undefined;

    /** Removes a record. */
    deleteRecord: (id: K) => boolean | undefined;

    /**
     * Marks `id` as the most recently INSERTED record (`lastInsertedIdentifier`). `addRecord`/
     * `editRecord` skip that side effect for a write made through `store.asFetched` (see the
     * `IRecordStore.isFetching` docs), because that flag also covers a routine background fetch
     * storing what it read — not a real create. `createTarget` is a real create wrapped in
     * `asFetched` for its OWN reason (the response is fresh, server-confirmed data), so it calls
     * this directly instead of relying on that side effect.
     */
    markInserted: (id: K) => void;
}

/** What the mutations need from the resource that owns them. */
export interface IResourceMutationsContext<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- record constraint: unknown rejects interfaces without an index signature
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
     * Stores a record the server returned (an update or create response) under its own id,
     * pointing the requested id at it when different (see the alias rule in resourceWrites.ts's
     * module header).
     */
    storeServerRecord: (
        item: T,
        requestedId: K | undefined,
        scope: unknown[],
        settings: Pick<IFetchSettings, 'merge' | 'partial'>
    ) => ITargetEntry<T>;

    /** Whether a scope is still claimed by any live instance (see restResource.ts's scope rule). */
    scopeRegistry: IScopeRegistry;

    /** Runs a late write only while its scope is still claimed (see ./liveScope). */
    inLiveScope: TInLiveScope;
}

/**
 * The writes of one resource.
 *
 * @param context - see IResourceMutationsContext
 * @returns mutateAny, createTarget, updateTarget, deleteTarget
 */
export const createResourceMutations = <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- record constraint: unknown rejects interfaces without an index signature
    T extends Record<string | number, any>,
    K extends string | number
>({
    queryClient,
    resourceKey,
    keys,
    dependsOn,
    records,
    store,
    storeServerRecord,
    scopeRegistry,
    inLiveScope
}: IResourceMutationsContext<T, K>) => {
    /** The record operations, by name. */
    const { createIdentifier, editRecord, deleteRecord, markInserted } = records;

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

    /** Stale-marking of a record (with its aliases) or of a scope's lists. */
    const invalidation = createResourceInvalidation(queryClient, keys);

    /**
     * Marks this resource's lists under `scope` stale; active ones refetch. Fire and forget.
     *
     * @param scope - the `dependsOn` snapshot whose lists changed
     */
    const invalidateLists = (scope: unknown[]): void => void invalidation.invalidateLists(scope);

    /**
     * Marks record `id` and its aliases stale; a watched one refetches. Called after a rollback
     * or a skipped success: what is left stored is a local guess, so the server reconciles it.
     * Fire and forget.
     *
     * @param id - the record's own (already resolved) id
     * @param scope - the scope the change ran under
     */
    const invalidateRecord = (id: K, scope: unknown[]): void =>
        void invalidation.invalidateRecord(id, scope);

    /**
     * Cancels record `id`'s own in-flight read, and every pointer to it, so neither lands an
     * older answer over the change. A list read of the scope is left running: `canWrite` keeps
     * its answer off this id once it lands, and every other id it holds is stored normally.
     *
     * @param id - the record's own (already resolved) id
     * @param scope - the scope the change runs under
     * @returns settles once the queries are cancelled
     */
    const cancelReads = (id: K, scope: unknown[]): Promise<unknown> =>
        queryClient.cancelQueries({ predicate: keys.refersTo(id, scope) });

    /**
     * The raw record stored under `id` right now. Reads through `store.read` (not the public
     * `getRecord`, which is scoped to the CURRENT `dependsOn()`): called from inside
     * `store.forScope`, it must see the scope the change ran under even once `dependsOn()` has
     * since moved on (see the scope rule in restResource.ts).
     *
     * @param id - the record id
     * @returns the raw record, if stored
     */
    const rawRecord = (id: K): T | undefined => {
        const record = store.read(id);
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
     * What `onMutate` hands `onSuccess`/`onError` as this mutation's context: the record right
     * before this call's own optimistic apply, and what that apply left it as. Read back in both
     * (via `rawRecord`) to tell "the record still holds exactly what THIS call wrote" from "a
     * newer mutation has since changed or removed it" — TanStack has no equivalent of its own.
     */
    interface IOptimisticContext {
        /** The record right before this call's apply; `undefined` when it did not exist. */
        previous: IRecordSnapshot<T> | undefined;

        /** What this call's apply left stored: the identity a later write is compared against. */
        written: T | undefined;
    }

    /**
     * `onMutate`: cancels the record's reads, then snapshots it and applies the change, all under
     * the scope the call started in. Its return value is the mutation's `context`. The liveness
     * check runs once, before the async cancel: a scope swept in the meantime is not re-checked.
     *
     * @param id - the record changed
     * @param apply - the local change
     * @param scope - the scope the call started in
     * @returns the context, or undefined when the scope is no longer claimed
     */
    const applyOptimistic = (
        id: K,
        apply: () => unknown,
        scope: unknown[]
    ): Promise<IOptimisticContext> | undefined => {
        if (!scopeRegistry.isLive(scope)) return undefined;
        return cancelReads(id, scope).then(() =>
            store.forScope(scope, () => {
                // Captured now, not at call start: a same-tick mutation on this id may already
                // have applied its own change by the time cancelReads resolves, and a failure here
                // must roll back to THAT, not to what the record held before either call began
                // (which a same-tick sibling would have captured too).
                const previous = store.snapshot(id);
                apply();
                return { previous, written: rawRecord(id) };
            })
        );
    };

    /**
     * `onSuccess`: stores the answer, but only while the record still holds exactly what this
     * call's own optimistic apply left. A newer mutation on the same id (a delete, another
     * update) has since changed or removed it, so this answer is stale: applying it would undo
     * what the newer one did, just like a stale rollback would. Then marks the lists stale.
     *
     * @param id - the record changed
     * @param scope - the scope the call started in
     * @param context - what `applyOptimistic` returned
     * @param storeResult - stores the answer
     */
    const settleSuccess = (
        id: K,
        scope: unknown[],
        context: IOptimisticContext | undefined,
        storeResult: () => void
    ): void =>
        inLiveScope(
            scope,
            () => {
                if (rawRecord(id) === context?.written) storeResult();
                else invalidateRecord(id, scope);
                invalidateLists(scope);
            },
            undefined
        );

    /**
     * `onError`: rolls the record back (only if this call still owns it) and marks the lists
     * stale. Ownership is read before the rollback: a newer mutation already owning the record
     * means there is nothing of THIS call's to reconcile, so its outcome stands.
     *
     * @param id - the record changed
     * @param scope - the scope the call started in
     * @param context - what `applyOptimistic` returned
     */
    const settleFailure = (
        id: K,
        scope: unknown[],
        context: IOptimisticContext | undefined
    ): void =>
        inLiveScope(
            scope,
            () => {
                const owned = rawRecord(id) === context?.written;
                rollback(id, context?.previous, context?.written);
                if (owned) invalidateRecord(id, scope);
                invalidateLists(scope);
            },
            undefined
        );

    /**
     * The optimistic protocol update and delete share, built on
     * TanStack's own `MutationObserver` lifecycle: `onMutate` cancels the record's reads,
     * snapshots and applies the change (its return value becomes `context`); `onSuccess`/`onError`
     * store the result or roll back; `onSettled` marks the scope's lists stale and detaches the
     * observer so the mutation can eventually leave the cache on its own `gcTime` — it must stay
     * long enough for a read that started before or during it, landing later, to still find it.
     * TanStack marks the mutation `pending` (with its own `submittedAt`) before `onMutate`
     * even runs, so `recordMutations.ts`'s `canWrite` sees it from the first line.
     *
     * @param id - the record changed
     * @param apply - the local change
     * @param kind - `'update'` or `'delete'` — the mutation key's own segment
     * @param apiCall - the server call
     * @param key - the caller's key, which `isLoading(key)` matches
     * @param onSuccessStore - stores the result, under the scope the call started in only
     * @returns the apiCall's result
     */
    const runOptimistic = <R>(
        id: K,
        apply: () => unknown,
        kind: 'update' | 'delete',
        apiCall: () => Promise<R>,
        key: string[] | undefined,
        onSuccessStore?: (result: R) => void
    ): Promise<R> => {
        const scopeAtStart = dependsOn();
        // performance.now(), not Date.now(): recordMutations.ts's canWrite compares this against a
        // read's own startedAt, and Date.now()'s millisecond resolution is coarse enough that two
        // operations in the same synchronous stretch can share a value.
        const startedAt = performance.now();
        const observer: MutationObserver<R, unknown, void, IOptimisticContext | undefined> =
            new MutationObserver(queryClient, {
                // String(id): mutation keys address the same (resolved) id the same way query keys do
                // (resourceKeys.ts's target()), so a filter matching one by id matches both.
                mutationKey: [resourceKey, kind, String(id)],
                mutationFn: apiCall,
                // scope/startedAt: what recordMutations.ts's canWrite matches a read against.
                meta: { key, scope: scopeAtStart, startedAt } satisfies IRecordMutationMeta & {
                    key?: string[];
                },
                onMutate: () => applyOptimistic(id, apply, scopeAtStart),
                onSuccess: (result, _variables, context) =>
                    settleSuccess(id, scopeAtStart, context, () => onSuccessStore?.(result)),
                onError: (_error, _variables, context) => settleFailure(id, scopeAtStart, context),
                // Runs before the mutation's own status moves off 'pending' (see Mutation#execute), so
                // this schedules the observer-less mutation for its OWN gcTime instead of removing it
                // outright — reset() while still 'pending' is what makes that distinction.
                onSettled: () => observer.reset()
            });
        return observer.mutate();
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
        if (dummyData) store.forScope(scopeAtStart, () => editRecord(dummyData, temporaryId, true));
        return runMutation(['create'], apiCall, key).then(
            (item) => {
                if (dummyData) store.forScope(scopeAtStart, () => deleteRecord(temporaryId));
                return inLiveScope(
                    scopeAtStart,
                    () => {
                        invalidateLists(scopeAtStart);
                        if (isNil(item)) return item;
                        // No requestedId: a create has no address of its own to turn into a pointer.
                        const stored = storeServerRecord(item, undefined, scopeAtStart, {});
                        // A real create: storeItem's own tracking is suppressed inside asFetched
                        // (see markInserted's docs), so mark it explicitly.
                        markInserted(createIdentifier(item));
                        return stored.data;
                    },
                    item
                );
            },
            (error: unknown) => {
                if (dummyData) store.forScope(scopeAtStart, () => deleteRecord(temporaryId));
                throw error;
            }
        );
    };

    /**
     * Stores a successful update's response as the record — unless `applyResponse` is off, or
     * the response is not a record (empty, an array, an acknowledgement): the optimistic patch
     * then stays. Goes through `storeServerRecord`: the response is stored under its OWN id, and
     * `requestedId` (a slug `updateTarget` was called with, say), if different, becomes a pointer
     * to it (see the alias rule in resourceWrites.ts's module header).
     *
     * @param data - the response
     * @param requestedId - the id `updateTarget` was called with, if any
     * @param scope - the scope the change ran under
     * @param settings - merge / applyResponse
     */
    const applyUpdateResponse = (
        data: unknown,
        requestedId: K | undefined,
        scope: unknown[],
        { merge = false, applyResponse = true }: IUpdateTargetSettings
    ): void => {
        if (!applyResponse || typeof data !== 'object' || data === null || Array.isArray(data))
            return;
        storeServerRecord(data as T, requestedId, scope, { merge });
    };

    /**
     * Update a record: applied locally first, rolled back on failure (see `runOptimistic`).
     * Success stores the response (see `applyResponse`). `id` is resolved first (see
     * `queryRecordStore.ts`'s `resolve`): updating by a known alias (a slug) reaches the record
     * it points at, and its mutation key — so `isSaving` sees it — is built from the SAME
     * resolved id a plain `updateTarget(..., 7)` would use.
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
        const targetId = store.resolve(id ?? createIdentifier(itemData as T));
        const scopeAtStart = dependsOn();
        return runOptimistic(
            targetId,
            () => editRecord(itemData, targetId, true),
            'update',
            apiCall,
            settings.key,
            (data) => applyUpdateResponse(data, targetId, scopeAtStart, settings)
        );
    };

    /**
     * Delete a record: removed locally first, restored on failure (see `runOptimistic`). `id`
     * is resolved first — see `updateTarget`'s own reasoning, above.
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
    ): Promise<F> => {
        const targetId = store.resolve(id);
        return runOptimistic(targetId, () => deleteRecord(targetId), 'delete', apiCall, key);
    };

    return { mutateAny, createTarget, updateTarget, deleteTarget };
};
