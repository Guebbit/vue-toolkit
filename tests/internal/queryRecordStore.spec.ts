/**
 * UNIT — internal/queryRecordStore.ts: freshness bookkeeping of the record store.
 *   - asFetched restores its flag even when `run()` throws, so a later local write is not stamped
 *     fresh
 *   - restore puts a record back exactly as snapshotted: its freshness stamp and its invalidated
 *     flag, not "now" and "valid"
 */

import { ref } from 'vue';
import type { QueryClient } from '@tanstack/vue-query';
import { createQueryRecordStore } from '../../src/internal/queryRecordStore';
import { createResourceKeys } from '../../src/internal/resourceKeys';
import { newTestClient } from '../structureRestApi/_helpers/harness';

interface IItem {
    id: number;
    name: string;
}

/** Clients built by the current test, cleared after it. */
const clients: QueryClient[] = [];

afterEach(() => {
    for (const client of clients.splice(0)) client.clear();
});

/** A record store over its own client, torn down after the test. */
const makeStore = () => {
    const queryClient = newTestClient();
    clients.push(queryClient);
    const keys = createResourceKeys('resource', () => []);
    const store = createQueryRecordStore<IItem, number>({
        queryClient,
        keys,
        dependsOn: () => [],
        version: ref(0)
    });
    return { queryClient, keys, store };
};

describe('UNIT · queryRecordStore.asFetched', () => {
    it('restores the "fetched" flag even when run() throws, so a later write is not wrongly stamped fresh', () => {
        const { queryClient, keys, store } = makeStore();

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

describe('UNIT · queryRecordStore.restore', () => {
    it('puts the record back with the freshness stamp it was snapshotted with, not "now"', () => {
        const { queryClient, keys, store } = makeStore();
        queryClient.setQueryData(
            keys.target(1),
            { data: { id: 1, name: 'Alice' } },
            { updatedAt: 1000 } // fetched long ago: stale
        );
        const saved = store.snapshot(1)!;
        store.asFetched(() => store.write(1, { id: 1, name: 'Edited' })); // stamped "now"

        store.restore(1, saved);

        expect(queryClient.getQueryState(keys.target(1))).toMatchObject({
            data: { data: { id: 1, name: 'Alice' } },
            dataUpdatedAt: 1000
        });
    });

    it('puts back the invalidated flag the record was snapshotted with', async () => {
        const { queryClient, keys, store } = makeStore();
        queryClient.setQueryData(keys.target(1), { data: { id: 1, name: 'Alice' } });
        // TanStack: mark stale without refetching
        await queryClient.invalidateQueries({ queryKey: keys.target(1), refetchType: 'none' });
        const saved = store.snapshot(1)!;
        store.asFetched(() => store.write(1, { id: 1, name: 'Edited' })); // a write clears the flag

        store.restore(1, saved);

        expect(queryClient.getQueryState(keys.target(1))?.isInvalidated).toBe(true);
    });
});
