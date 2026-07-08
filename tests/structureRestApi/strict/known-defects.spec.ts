/**
 * STRICT — one failing test per known defect. These are EXPECTED TO FAIL against
 * the current code; each encodes the behaviour a consumer is entitled to assume.
 * When a defect is fixed, its test flips green — so this file doubles as the
 * regression gate for the "criticals" discussion.
 *
 * Defects pinned here:
 *   1. loading is not ref-counted (flickers false while a sibling fetch is pending)
 *   2. optimistic-update rollback is lossy (a merge can't remove an added field)
 *   3. deleteTarget ignores lastUpdateKey (only clears the '' bucket)
 *   4. searchKeyGen collides on nested-object filters (wrong results served)
 *   5. itemDictionary is never pruned (unbounded growth / memory leak)
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve, apiReject, deferredApi } from '../_helpers/fakeApi';
import { USERS, buildArticles, type IUser, type IArticle } from '../_helpers/fixtures';

afterEach(clearAllInstances);

describe('STRICT · known defects (expected to fail)', () => {
    it('DEFECT 1 — loading stays true while a concurrent fetch is still pending', async () => {
        const c = makeComposable<IUser, number>();
        const a = deferredApi<IUser[]>();
        const b = deferredApi<IUser[]>();
        // two independent fetches (different keys → both actually run)
        const p1 = c.fetchAll(a.call, { lastUpdateKey: 'A' });
        const p2 = c.fetchAll(b.call, { lastUpdateKey: 'B' });
        expect(c.loading.value).toBe(true);

        a.control.resolve([...USERS]);
        await p1;
        // b is still in flight, so loading MUST still be true (ref-counted).
        expect(c.loading.value).toBe(true);

        b.control.resolve([...USERS]);
        await p2;
        expect(c.loading.value).toBe(false);
    });

    it('DEFECT 2 — a failed optimistic update rolls back fields it added', async () => {
        const c = makeComposable<IUser, number>();
        const original: IUser = { id: 1, name: 'Alice', email: 'a@x.com' };
        await c.fetchTarget(apiResolve(original), 1);

        // optimistic patch introduces a NEW field, then the server rejects
        await expect(
            c.updateTarget(apiReject(), { draft: true } as unknown as Partial<IUser>, 1)
        ).rejects.toThrow();

        // rollback must restore the record exactly — the added field must be gone
        expect(c.getRecord(1)).not.toHaveProperty('draft');
        expect(c.getRecord(1)).toEqual(original);
    });

    it('DEFECT 3 — deleteTarget invalidates a target cached under a lastUpdateKey', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(USERS[0]), 1, { lastUpdateKey: 'v1' });
        await c.deleteTarget(apiResolve({ ok: true }), 1);

        // the namespaced entry should be gone → this must refetch
        const get = apiResolve(USERS[0]);
        await c.fetchTarget(get, 1, { lastUpdateKey: 'v1' });
        expect(get).toHaveBeenCalledTimes(1);
    });

    it('DEFECT 4 — nested-object filters are distinct cache buckets', async () => {
        const c = makeComposable<IArticle, number>();
        const first = apiResolve(buildArticles(2, 'tech', 1)); // ids 1,2
        const second = apiResolve(buildArticles(2, 'tech', 50)); // ids 50,51

        await c.fetchSearch(first, { sort: { by: 'name' } }, 1);
        await c.fetchSearch(second, { sort: { by: 'date' } }, 1);

        // different nested filters → the second search must actually run ...
        expect(second).toHaveBeenCalledTimes(1);
        // ... and return its own results, not the first search's.
        expect(c.searchGet({ sort: { by: 'date' } }, 1).map((a) => a.id)).toEqual([50, 51]);
    });

    it('DEFECT 5 — items are evicted from the dictionary once their cache entries are gone', async () => {
        const c = makeComposable<IArticle, number>();
        await c.fetchSearch(apiResolve(buildArticles(10, 'tech', 1)), { category: 'tech' }, 1);
        expect(c.itemList.value).toHaveLength(10);

        c.queryClient.clear(); // evict every cached query
        c.searchCleanup(); // prunes the search id-lists ...

        // ... the 10 orphaned items should not linger in the dictionary forever.
        expect(c.itemList.value).toHaveLength(0);
    });
});
