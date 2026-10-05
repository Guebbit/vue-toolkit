/**
 * The implementation behind `useStructureRestApi`: a composition root wiring one resource.
 *
 * Layers, bottom up: the key layout (`resourceKeys`), what is in flight (`resourceActivity`), the
 * records and relations stored as TanStack queries (`queryRecordStore`, `parentRelations`, under
 * `useStructureDataManagement`), then the operations over the same `QueryClient` — writes
 * (`resourceWrites`), one-shot reads (`resourceReads`), active reads (`resourceWatchers`) and
 * mutations (`resourceMutations`). An answer belongs to the scope in ITS OWN query's key, and is
 * stored only while some live instance still claims that scope (`scopeRegistry`).
 *
 * Returns the public `api`, and the `engine` `useStructureSearchApi` builds its `'search'` kind
 * on. The engine never reaches application code.
 *
 * @module internal/restResource
 * @see docs/composables/structure-rest-api.md
 */
import { getCurrentScope, markRaw, onScopeDispose, watch } from 'vue';
import { useQueryClient, type QueryClient } from '@tanstack/vue-query';
import { useStructureDataManagement, type TIdOf } from '../composables/structureDataManagement.js';
import type { IStructureRestApiOptions } from '../composables/structureRestApi.js';
import { stableKey } from './plainData.js';
import { createResourceKeys, resourceOf } from './resourceKeys.js';
import { useResourceActivity } from './resourceActivity.js';
import { createQueryRecordStore } from './queryRecordStore.js';
import { createQueryRelationStore } from './parentRelations.js';
import { createFreshnessChecks } from './freshnessChecks.js';
import { createResourceWrites } from './resourceWrites.js';
import { createResourceReads } from './resourceReads.js';
import { createResourceWatchers } from './resourceWatchers.js';
import { createResourceMutations } from './resourceMutations.js';
import { createResourceInvalidation } from './resourceInvalidation.js';
import { dropQueries } from './queryRemoval.js';
import { createInLiveScope } from './liveScope.js';
import { scopeRegistryFor } from './scopeRegistry.js';

/** resourceKeys already warned about being built outside an effect scope (see createRestResource). */
const warnedNoScope = new Set<string>();

/**
 * Builds a resource: its public API and the engine the search layer shares.
 *
 * @param options - see IStructureRestApiOptions
 * @returns `api` (public) and `engine` (internal)
 */
export const createRestResource = <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- record constraint: unknown rejects interfaces without an index signature
    T extends Record<string | number, any> = Record<string, any>,
    K extends string | number = TIdOf<T>,
    P extends string | number = string | number
>({
    identifiers = 'id',
    resourceKey,
    staleTime = 3_600_000, // 1 hour
    dependsOn = () => [],
    maxRecords = 10_000,
    delimiter = '|',
    queryClient: queryClientOption,
    queryOptions: resourceQueryOptions = {}
}: IStructureRestApiOptions) => {
    // Every cache subscription this resource makes (resourceActivity, the scope registry claim
    // below) is torn down through onScopeDispose — with no effect scope active, there is nothing
    // to call it, and no other way to stop them: they leak for the QueryClient's whole lifetime,
    // silently. Warned once per resourceKey rather than every call, so a factory invoked in a loop
    // doesn't flood the console.
    if (!getCurrentScope() && !warnedNoScope.has(resourceKey)) {
        warnedNoScope.add(resourceKey);
        // eslint-disable-next-line no-console -- a silent, permanent subscription leak is worth seeing
        console.warn(
            `useStructureRestApi('${resourceKey}'): built outside an effect scope (a component's ` +
                'setup, a Pinia setup store, or effectScope()). Its cache subscriptions have nothing ' +
                "to stop them and will leak for the QueryClient's lifetime."
        );
    }

    /**
     * The one cache. `markRaw`: Pinia wraps a setup store's return in `reactive()`, and calling a
     * `QueryClient` method (native `#private` fields) through that proxy throws.
     */
    const queryClient: QueryClient = markRaw(queryClientOption ?? useQueryClient());

    /** Key layout and scope predicates. */
    const keys = createResourceKeys(resourceKey, dependsOn);

    /** What this resource has in flight, and when its data changes. */
    const activity = useResourceActivity(queryClient, resourceKey, (id) => store.resolve(id as K));

    // TanStack defaults, by key prefix (every scope at once). gcTime Infinity: records, parent
    // relations and search pages stay cached while nothing watches them — stale data still
    // renders, and `getListByParent`/`pageItemList` read them straight from the cache. They leave
    // through dependsOn, resetAll and maxRecords instead (records also through resetRecords and
    // deletes).
    queryClient.setQueryDefaults([resourceKey, 'target'], { gcTime: Infinity });
    queryClient.setQueryDefaults([resourceKey, 'parent'], { gcTime: Infinity });
    queryClient.setQueryDefaults([resourceKey, 'search'], { gcTime: Infinity });

    /**
     * Live-scope claims for this (queryClient, resourceKey): a second instance under a different
     * scope (two screens side by side) coexists with this one instead of either wiping the
     * other's data (see ./scopeRegistry).
     */
    const scopeRegistry = scopeRegistryFor(queryClient, resourceKey);

    /** Releases this instance's claim. Claimed before the sweep below, so it is never swept. */
    let releaseScope = scopeRegistry.claim(dependsOn());
    if (getCurrentScope()) onScopeDispose(() => releaseScope());

    // Anything of this resource cached under a scope nothing claims any more belongs to a user or
    // language that is no longer current (it changed while no instance was alive to clean up):
    // drop it. A scope another live instance still claims is left alone.
    dropQueries(
        queryClient,
        (query) =>
            resourceOf(query.queryKey) === resourceKey &&
            !scopeRegistry.isLive(keys.scopeOf(query.queryKey))
    );

    /** The records, stored as TanStack queries. */
    const store = createQueryRecordStore<T, K>({
        queryClient,
        keys,
        dependsOn,
        version: activity.version('target')
    });

    /** Runs a late write only while its scope is still claimed (see ./liveScope). */
    const inLiveScope = createInLiveScope(store, scopeRegistry);

    /** belongsTo relations, stored as TanStack queries — the same seam as `store`, for `records`. */
    const relationStore = createQueryRelationStore<K, P>({
        queryClient,
        keys,
        dependsOn,
        version: activity.version('parent')
    });

    /** Records, selection, pagination and relations, written through the stores. */
    const records = useStructureDataManagement<T, K, P>(
        identifiers,
        delimiter,
        store,
        relationStore
    );

    /** Record accessors and state, built on by the operations below and passed through. */
    const {
        createIdentifier,
        identifier: identifierKey,
        itemList,
        setRecords,
        resetRecords,
        getRecord,
        getRecords,
        addRecord,
        addRecords,
        editRecord,
        editRecords,
        deleteRecord,
        selectedIdentifier,
        selectedRecord,
        lastInsertedIdentifier,
        lastInsertedIdentifiers,
        lastInsertedRecord,
        pageCurrent,
        pageSize,
        pageTotal,
        pageOffset,
        pageItemList,
        addToParent,
        removeFromParent,
        removeDuplicateChildren,
        getRecordsByParent,
        getListByParent
    } = records;

    /** "Would this call be served from cache?", plus the freshness test the reads share. */
    const { isFresh, classifyMultiple, ...freshnessChecks } = createFreshnessChecks<K, P>({
        queryClient,
        keys,
        dependsOn,
        staleTime
    });

    /** How answers are stored: one record, a server-returned record, a batch. */
    const writes = createResourceWrites<T, K>({
        queryClient,
        resourceKey,
        keys,
        store,
        inLiveScope,
        maxRecords,
        identity: { identifiers, delimiter },
        records: { createIdentifier, addRecord, editRecord }
    });

    /** Optimistic writes and free-form commands. */
    const mutations = createResourceMutations<T, K>({
        queryClient,
        resourceKey,
        keys,
        dependsOn,
        records: {
            createIdentifier,
            editRecord,
            deleteRecord,
            markInserted: (id: K) => {
                lastInsertedIdentifier.value = id;
            }
        },
        store,
        storeServerRecord: writes.storeServerRecord,
        scopeRegistry,
        inLiveScope
    });

    /** One-shot reads, and the query functions the watchers share. */
    const reads = createResourceReads<T, K, P>({
        queryClient,
        resourceKey,
        keys,
        dependsOn,
        staleTime,
        store,
        inLiveScope,
        writes,
        records: { createIdentifier, getRecord },
        classifyMultiple
    });

    /** Active reads. */
    const watchers = createResourceWatchers<T, K, P>({
        queryClient,
        keys,
        dependsOn,
        resourceQueryOptions,
        isFresh,
        reads,
        records: { getRecord, selectedIdentifier }
    });

    /** Stale-marking by record or by list. */
    const invalidation = createResourceInvalidation(queryClient, keys);

    /**
     * Marks record `id` (following an alias) and every pointer to it stale, under the current
     * `dependsOn`; a watched one refetches.
     *
     * @param id - the record id, or an alias of it
     * @returns settles once the active refetches have
     */
    const invalidateTarget = (id: K): Promise<void> =>
        invalidation.invalidateRecord(store.resolve(id), dependsOn());

    /**
     * Marks every list of the current `dependsOn` stale (all, parent, page, search); watched ones
     * refetch.
     *
     * @returns settles once the active refetches have
     */
    const invalidateLists = (): Promise<void> => invalidation.invalidateLists(dependsOn());

    /**
     * Drops every query of this resource under the current `dependsOn` — records, lists,
     * searches — so the views empty with them; what an active watcher shows is fetched again.
     * Broader than `resetRecords()` (records only).
     */
    const resetAll = (): void => dropQueries(queryClient, keys.inScope(dependsOn()), true);

    // dependsOn changed (logout, login, language switch): cancel and drop everything under the
    // old scope, so the old user's data leaves memory. Active watchers follow on their own:
    // their keys embed dependsOn.
    watch(dependsOn, (current, previous) => {
        if (stableKey(current) === stableKey(previous)) return;
        // Move this instance's claim before checking who still needs the old scope: if it was the
        // only one claiming it, releasing first is what makes isLive(previous) false below.
        releaseScope();
        releaseScope = scopeRegistry.claim(current);
        if (scopeRegistry.isLive(previous)) return; // another instance still shows that data
        const inPrevious = keys.inScope(previous);
        // Cancelling never rejects; the drop runs once the old fetches have stopped.
        void queryClient
            .cancelQueries({ predicate: inPrevious })
            .then(() => dropQueries(queryClient, inPrevious));
    });

    /** The public API. */
    const api = {
        // identity and settings
        createIdentifier,
        identifierKey,
        resourceKey,
        maxRecords,

        // the TanStack client, markRaw'd: read or invalidate it from anywhere
        queryClient,

        // records (the stores' own computed views, read-only)
        itemDictionary: store.dictionary,
        itemList,
        setRecords,
        resetRecords,
        resetAll,
        getRecord,
        getRecords,
        addRecord,
        addRecords,
        editRecord,
        editRecords,
        deleteRecord,
        selectedIdentifier,
        selectedRecord,
        lastInsertedIdentifier,
        lastInsertedIdentifiers,
        lastInsertedRecord,

        // client-side pagination
        pageCurrent,
        pageSize,
        pageTotal,
        pageOffset,
        pageItemList,

        // belongsTo relations
        parentHasMany: relationStore.dictionary,
        addToParent,
        removeFromParent,
        removeDuplicateChildren,
        getRecordsByParent,
        getListByParent,

        // loading
        loading: activity.loading,
        isLoading: activity.isLoading,
        isSaving: activity.isSaving,

        // reads
        fetchAny: reads.fetchAny,
        fetchAll: reads.fetchAll,
        fetchByParent: reads.fetchByParent,
        fetchTarget: reads.fetchTarget,
        fetchMultiple: reads.fetchMultiple,
        fetchPaginate: reads.fetchPaginate,
        watchTarget: watchers.watchTarget,
        watchAll: watchers.watchAll,
        watchByParent: watchers.watchByParent,
        watchAny: watchers.watchAny,

        // invalidation
        invalidateTarget,
        invalidateLists,

        // writes: createTarget, updateTarget, deleteTarget, mutateAny
        ...mutations,

        // pre-flight freshness checks: checkTarget, checkAll, checkByParent, checkPaginate,
        // checkAny, checkMultiple
        ...freshnessChecks
    };

    /** The machinery `useStructureSearchApi` builds its `'search'` kind on. */
    const engine = {
        queryClient,
        keys,
        dependsOn,
        version: activity.version,
        isFresh,
        staleTimeOf: reads.staleTimeOf,
        runListQuery: reads.runListQuery,
        listQueryFunction: reads.listQueryFunction,
        watchQuery: watchers.watchQuery
    };

    return { api, engine };
};
