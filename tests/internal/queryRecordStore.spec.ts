/**
 * UNIT — internal/queryRecordStore.ts: asFetched restores its flag even when `run()` throws.
 *
 * Without `finally`, a throw inside `run()` left the "fetched" flag stuck on `true` — every LATER
 * local write (an optimistic edit, a plain `addRecord`) would then be wrongly stamped fresh
 * (`dataUpdatedAt: now`) instead of keeping its previous stamp, as a local guess must.
 */

import { ref } from 'vue';
import { QueryClient } from '@tanstack/vue-query';
import { createQueryRecordStore } from '../../src/internal/queryRecordStore';
import { createResourceKeys } from '../../src/internal/resourceKeys';

interface IItem {
    id: number;
    name: string;
}

describe('UNIT · queryRecordStore.asFetched', () => {
    it('restores the "fetched" flag even when run() throws, so a later write is not wrongly stamped fresh', () => {
        const queryClient = new QueryClient();
        const keys = createResourceKeys('resource', () => []);
        const store = createQueryRecordStore<IItem, number>({
            queryClient,
            keys,
            dependsOn: () => [],
            version: ref(0)
        });

        expect(() =>
            store.asFetched(() => {
                throw new Error('boom');
            })
        ).toThrow('boom');

        // A write after the throw is a local guess, not a server answer: it must keep the "no
        // previous stamp" freshness (0 → stale) a brand-new record gets, not "now" (fresh).
        store.write(1, { id: 1, name: 'Alice' });
        const state = queryClient.getQueryState(keys.target(1));
        expect(state?.dataUpdatedAt).toBe(0);
    });
});
