/**
 * UNIT — internal/queryRecordStore.ts: freshness bookkeeping of the record store.
 *   - asFetched restores its flag even when `run()` throws, so a later local write is not stamped
 *     fresh
 *   - restore puts a record back exactly as snapshotted: its freshness stamp and its invalidated
 *     flag, not "now" and "valid"
 */

import { ref } from 'vue';
import { QueryObserver, type QueryClient } from '@tanstack/vue-query';
import { createQueryRecordStore } from '../../src/internal/queryRecordStore';
import { createResourceKeys } from '../../src/internal/resourceKeys';
import { flush, newTestClient } from '../structureRestApi/_helpers/harness';

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

/**
 * Watches the `all` list of the store's resource, counting how often its query function runs.
 *
 * @param queryClient - the client to watch on
 * @param keys - the resource's key layout
 * @returns the fetch counter and the unsubscribe function
 */
const watchList = (queryClient: QueryClient, keys: ReturnType<typeof createResourceKeys>) => {
    const counter = { fetches: 0 };
    const observer = new QueryObserver(queryClient, {
        queryKey: keys.entry('all', []),
        queryFn: () => {
            counter.fetches += 1;
            return Promise.resolve({ ids: [] });
        },
        staleTime: Infinity
    });
    const unsubscribe = observer.subscribe(() => {});
    return { counter, unsubscribe };
};

describe('UNIT · queryRecordStore.clear / writeAll', () => {
    it('clear() refetches an active list watcher', async () => {
        const { queryClient, keys, store } = makeStore();
        const { counter, unsubscribe } = watchList(queryClient, keys);
        await flush();
        expect(counter.fetches).toBe(1);

        store.clear();
        await flush();

        expect(counter.fetches).toBe(2);
        unsubscribe();
    });

    it('writeAll() marks the list stale but does not refetch it', async () => {
        const { queryClient, keys, store } = makeStore();
        const { counter, unsubscribe } = watchList(queryClient, keys);
        await flush();

        store.writeAll({ [1]: { id: 1, name: 'Alice' } });
        await flush();

        expect(counter.fetches).toBe(1);
        expect(queryClient.getQueryState(keys.entry('all', []))?.isInvalidated).toBe(true);
        unsubscribe();
    });
});

describe('UNIT · queryRecordStore.snapshot', () => {
    it('is undefined for a record cached as null', () => {
        const { queryClient, keys, store } = makeStore();
        // eslint-disable-next-line unicorn/no-null
        queryClient.setQueryData(keys.target(1), { data: null });

        expect(store.snapshot(1)).toBeUndefined();
    });

    it('is undefined for a record that is not cached at all', () => {
        const { store } = makeStore();

        expect(store.snapshot(1)).toBeUndefined();
    });

    it('carries the item, its stamp and its invalidated flag', () => {
        const { queryClient, keys, store } = makeStore();
        queryClient.setQueryData(
            keys.target(1),
            { data: { id: 1, name: 'Alice' } },
            { updatedAt: 1000 }
        );

        expect(store.snapshot(1)).toEqual({
            item: { id: 1, name: 'Alice' },
            updatedAt: 1000,
            isInvalidated: false
        });
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

    it('leaves a record valid when its snapshot was not invalidated', () => {
        const { queryClient, keys, store } = makeStore();
        queryClient.setQueryData(keys.target(1), { data: { id: 1, name: 'Alice' } });
        const saved = store.snapshot(1)!;

        store.restore(1, saved);

        expect(queryClient.getQueryState(keys.target(1))?.isInvalidated).toBe(false);
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
