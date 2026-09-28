/**
 * Writes search-cache entries straight into a QueryClient, so a spec can lay out the exact cache
 * a predicate has to judge — any scope, kind, filters, page, bucket key and `dataUpdatedAt` —
 * without a fetch per entry.
 * Plain module (not a *.spec.ts) so Jest's testMatch ignores it.
 */

import type { QueryClient } from '@tanstack/vue-query';
import { stableKey } from '../../../src/internal/plainData';

/** What to write: the defaults describe a page of the default-scope `'resource'` search. */
export interface ISeedPage {
    /** Filters the page belongs to (keyed through `stableKey`, like the composable does). */
    filters?: object;

    /** Page size segment of the key. */
    size?: number;

    /** Page number segment of the key. */
    page?: number;

    /** Bucket-key segments appended to the key. */
    key?: string[];

    /** The `dependsOn()` snapshot segment. */
    scope?: unknown[];

    /** The kind segment; `'search'` unless a spec wants a look-alike of another kind. */
    kind?: string;

    /** The `totalItems` the entry carries, so a spec can tell pages apart by it. */
    totalItems: number;

    /** Explicit `dataUpdatedAt`; the client's clock when omitted. */
    updatedAt?: number;
}

/**
 * Writes one entry in the cache layout `[resourceKey, kind, scope, filters, size, page, ...key]`.
 *
 * @param client - the composable's QueryClient
 * @param seed - what to write
 * @returns the query key it wrote under
 */
export function seedPage(client: QueryClient, seed: ISeedPage): unknown[] {
    const queryKey = [
        'resource',
        seed.kind ?? 'search',
        seed.scope ?? [],
        stableKey(seed.filters ?? {}),
        seed.size ?? 10,
        seed.page ?? 1,
        ...(seed.key ?? [])
    ];
    client.setQueryData(
        queryKey,
        { ids: [], totalItems: seed.totalItems },
        // TanStack: pin the freshness timestamp so page ordering is deterministic.
        seed.updatedAt === undefined ? undefined : { updatedAt: seed.updatedAt }
    );
    return queryKey;
}
