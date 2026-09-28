/**
 * UNIT — asymptotics pin for a merge/partial list write over a large cache.
 *
 * Under the REST layer, `dictionary` is a computed that rebuilds its ENTIRE scope from the query
 * cache (one `QueryCache.findAll` sweep) whenever it is stale, and each write in a batch makes it
 * stale for the next read. Reading through it, merging or partially writing a batch of N items
 * over a cache of M records would cost one sweep PER ITEM — O(N × M) work. `editRecord` reads
 * through `IRecordStore.read` instead: a direct O(1) `getQueryData` lookup.
 *
 * Pinned by counting `findAll` calls rather than wall-clock time: a count is exact and immune to
 * machine load, where a millisecond budget either flakes under CI/dev-machine CPU contention or,
 * loosened enough not to, stops being tight enough to actually catch the O(N × M) path returning.
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { buildUsers, type IUser } from '../_helpers/fixtures';

afterEach(() => {
    jest.restoreAllMocks(); // the findAll spy, even when an assertion failed
    clearAllInstances();
});

describe('UNIT · asymptotics — merge over a large cache', () => {
    it('merging 1k items over 3k cached records does not sweep the cache once per item', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchAll(apiResolve(buildUsers(3000)));

        const findAll = jest.spyOn(c.queryClient.getQueryCache(), 'findAll');
        findAll.mockClear();

        const batch = buildUsers(1000); // ids 1..1000: all already cached, all merged onto
        await c.fetchAll(apiResolve(batch), { merge: true, key: ['merge-batch'] });

        // O(1) sweeps regardless of batch size (enforceMaxRecords, the incoming-list dictionary
        // rebuild): nowhere near the ~1000 a per-item findAll would cause.
        expect(findAll.mock.calls.length).toBeLessThan(20);
        expect(c.itemList.value).toHaveLength(3000);
    });
});
