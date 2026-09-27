/**
 * How many live resource instances currently claim each `dependsOn` scope, per `(QueryClient,
 * resourceKey)`. Two instances of the same resource can be alive at once under different scopes
 * (a comparison view, two panels side by side) — without this, either one's start-up sweep or the
 * other's `dependsOn` switch would read the other's scope as abandoned and drop its data out from
 * under it. A scope is safe to drop only once nothing claims it any more.
 *
 * @module internal/scopeRegistry
 */
import type { QueryClient } from '@tanstack/vue-query';
import { stableKey } from './plainData.js';

/** Live-claim counts, one map of scope → count per resourceKey, one of those per QueryClient. */
const registries = new WeakMap<QueryClient, Map<string, Map<string, number>>>();

/**
 * The scope→count map for one `(queryClient, resourceKey)` pair, created on first use.
 *
 * @param queryClient - the client the resource's queries live on
 * @param resourceKey - the resource's key
 * @returns its scope→count map
 */
const countsFor = (queryClient: QueryClient, resourceKey: string): Map<string, number> => {
    let byResource = registries.get(queryClient);
    if (!byResource) {
        byResource = new Map();
        registries.set(queryClient, byResource);
    }
    let counts = byResource.get(resourceKey);
    if (!counts) {
        counts = new Map();
        byResource.set(resourceKey, counts);
    }
    return counts;
};

/** A resource's live-scope registry. */
export interface IScopeRegistry {
    /**
     * Claims `scope` for one live instance.
     *
     * @param scope - the `dependsOn` snapshot to claim
     * @returns releases the claim; safe to call once
     */
    claim: (scope: unknown[]) => () => void;

    /**
     * Whether any live instance currently claims `scope`.
     *
     * @param scope - the `dependsOn` snapshot to check
     * @returns whether it is claimed
     */
    isLive: (scope: unknown[]) => boolean;
}

/**
 * The live-scope registry of one `(queryClient, resourceKey)` pair.
 *
 * @param queryClient - the client the resource's queries live on
 * @param resourceKey - the resource's key
 * @returns the registry
 */
export const scopeRegistryFor = (queryClient: QueryClient, resourceKey: string): IScopeRegistry => {
    const counts = countsFor(queryClient, resourceKey);

    const claim = (scope: unknown[]): (() => void) => {
        const key = stableKey(scope);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        let released = false;
        return () => {
            if (released) return;
            released = true;
            const remaining = (counts.get(key) ?? 1) - 1;
            if (remaining <= 0) counts.delete(key);
            else counts.set(key, remaining);
        };
    };

    const isLive = (scope: unknown[]): boolean => (counts.get(stableKey(scope)) ?? 0) > 0;

    return { claim, isLive };
};
