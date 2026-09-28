/**
 * "Is record `id` currently being changed?" — asked of TanStack's own `MutationCache`, the exact
 * question `isSaving` already asks, so a read and a mutation always agree: one cache per
 * `QueryClient`, ids compared as strings, no private per-instance registry to keep in sync.
 * Ordering ("did this mutation start before this read") uses `meta.startedAt`, a `performance.now()`
 * value the mutation carries itself — not TanStack's own `submittedAt` (`Date.now()`, millisecond
 * resolution, easily shared by two operations in the same synchronous stretch).
 *
 * @module internal/recordMutations
 */
import type { Mutation, QueryClient } from '@tanstack/vue-query';
import { stableKey } from './plainData.js';

/** `meta` every `update`/`delete` mutation carries: the scope and moment it started. */
export interface IRecordMutationMeta {
    /** The `dependsOn` snapshot this mutation started under. */
    scope: unknown[];

    /**
     * `performance.now()` when this mutation started — NOT TanStack's own `submittedAt`
     * (`Date.now()`, millisecond resolution): two operations in the same synchronous stretch of a
     * test easily land in the same millisecond, and `submittedAt < readStartedAt` would then read
     * as false for a read that genuinely started after this mutation, wrongly blocking it.
     * `performance.now()` is monotonic and fine-grained enough that two distinct captures never
     * collide.
     */
    startedAt: number;
}

/**
 * `update`/`delete` mutations of record `id`, for `resourceKey`, on `queryClient` — the mutation
 * key layout `resourceMutations.ts` builds every such mutation with:
 * `[resourceKey, 'update' | 'delete', String(id)]`.
 *
 * @param queryClient - the client the mutations run on
 * @param resourceKey - first key segment of every mutation of this resource
 * @param id - the record's own (already resolved) id
 * @returns the matching mutations
 */
export const recordMutationsOf = (
    queryClient: QueryClient,
    resourceKey: string,
    id: unknown
): Mutation[] => {
    const idKey = String(id);
    return queryClient.getMutationCache().findAll({
        predicate: (mutation) => {
            const key = mutation.options.mutationKey;
            return (
                key?.[0] === resourceKey &&
                (key[1] === 'update' || key[1] === 'delete') &&
                key[2] === idKey
            );
        }
    });
};

/**
 * Whether a read that began at `readStartedAt`, for record `id` in `scope`, may still write it:
 * none of its mutations, in that same scope, may be pending, and none may have started (its own
 * `meta.startedAt`) at or after `readStartedAt`. A mutation that already finished before the read
 * began has nothing left to protect against; nothing here needs pruning — a finished mutation
 * leaves the cache on its own `gcTime`, same as any other.
 *
 * @param queryClient - the client the mutation and the read share
 * @param resourceKey - first key segment of every mutation of this resource
 * @param id - the record's own (already resolved) id
 * @param scope - the scope the read runs under
 * @param readStartedAt - when the read began (`performance.now()`)
 * @returns whether the write is still allowed
 */
export const canWrite = (
    queryClient: QueryClient,
    resourceKey: string,
    id: unknown,
    scope: unknown[],
    readStartedAt: number
): boolean => {
    const scopeKey = stableKey(scope);
    return recordMutationsOf(queryClient, resourceKey, id)
        .filter(
            (mutation) =>
                stableKey((mutation.options.meta as IRecordMutationMeta | undefined)?.scope) ===
                scopeKey
        )
        .every((mutation) => {
            const meta = mutation.options.meta as IRecordMutationMeta | undefined;
            return mutation.state.status !== 'pending' && (meta?.startedAt ?? 0) < readStartedAt;
        });
};
