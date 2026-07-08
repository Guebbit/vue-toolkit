/**
 * INTENTION — one shared freshness map across every method.
 *
 * Any method that produces items (list/search/parent fetches, create, update)
 * SEEDS the per-item target cache, so a subsequent fetchTarget / fetchMultiple
 * for those ids is served without touching the network. This is the payoff of
 * "TanStack Query as the single source of truth".
 *
 * Includes one test that pins a KNOWN BUG: the seeding paths store the raw item
 * while fetchTarget unwraps `{ data }`, so fetchTarget's RETURN VALUE after a
 * seeding fetch is currently undefined. It is expected to FAIL until fixed.
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { USERS, buildArticles, type IUser, type IArticle } from '../_helpers/fixtures';

afterEach(clearAllInstances);

describe('INTENTION · cross-method cache seeding', () => {
    it('fetchAll → fetchTarget(id) is served from cache', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchAll(apiResolve([...USERS]));
        const get = apiResolve(USERS[0]);
        await c.fetchTarget(get, 1);
        expect(get).not.toHaveBeenCalled();
        expect(c.getRecord(1)).toEqual(USERS[0]);
    });

    it('fetchAll → fetchMultiple(ids) serves every id from cache', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchAll(apiResolve([...USERS]));
        const batch = apiResolve([...USERS]);
        const result = await c.fetchMultiple(batch, [1, 2, 3]);
        expect(batch).not.toHaveBeenCalled();
        expect(result).toHaveLength(3);
    });

    it('fetchSearch → fetchTarget(id) is served from cache', async () => {
        const c = makeComposable<IArticle, number>();
        await c.fetchSearch(apiResolve(buildArticles(3, 'tech', 1)), { category: 'tech' }, 1);
        const get = apiResolve(buildArticles(1, 'tech', 1)[0]);
        await c.fetchTarget(get, 1);
        expect(get).not.toHaveBeenCalled();
    });

    it('fetchByParent → fetchTarget(id) is served from cache', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchByParent(apiResolve([...USERS]), 'team-1');
        const get = apiResolve(USERS[0]);
        await c.fetchTarget(get, 1);
        expect(get).not.toHaveBeenCalled();
    });

    it('createTarget → fetchTarget(id) is served from cache', async () => {
        const c = makeComposable<IUser, number>();
        const created: IUser = { id: 4, name: 'Dave', email: 'dave@example.com' };
        await c.createTarget(apiResolve(created));
        const get = apiResolve(created);
        await c.fetchTarget(get, 4);
        expect(get).not.toHaveBeenCalled();
    });

    it('updateTarget → fetchTarget(id) is served from cache', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(USERS[0]), 1);
        await c.updateTarget(apiResolve(USERS[0]), { name: 'Alice 2' }, 1);
        const get = apiResolve(USERS[0]);
        await c.fetchTarget(get, 1);
        expect(get).not.toHaveBeenCalled();
    });

    // ---------------------------------------------------------------------
    // KNOWN BUG (expected to FAIL): return-value contract of fetchTarget.
    // ---------------------------------------------------------------------
    it('BUG: fetchTarget RETURNS the item seeded by a prior list fetch', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchAll(apiResolve([...USERS]));
        // Network is correctly skipped, but the seeded raw item is not unwrapped
        // as `{ data }`, so the resolved value is currently `undefined`.
        const result = await c.fetchTarget(apiResolve(USERS[0]), 1);
        expect(result).toEqual(USERS[0]);
    });
});
