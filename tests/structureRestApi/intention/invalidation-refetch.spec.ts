/**
 * INTENTION — "active = on screen": an ACTIVE watch* call genuinely REFETCHES on
 * invalidation, not merely marks its data stale. This is what makes
 * `queryClient.invalidateQueries({queryKey:[resourceKey]})` from another store — or this
 * resource's own createTarget/updateTarget/deleteTarget — actually update a screen that's
 * currently open, with no imperative refetch call anywhere.
 *
 * (The search kind: tests/structureSearchApi/intention/mutation-invalidation.spec.ts.)
 */

import { makeComposable, clearAllInstances, flush } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { USERS, buildUsers, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

describe('INTENTION · an active watch* refetches on invalidation', () => {
    it('watchAll refetches when invalidateQueries is called from outside the composable', async () => {
        const c = makeComposable<IUser, number>({ resourceKey: 'orders' });
        const apiCall = jest.fn(() => Promise.resolve([...USERS]));

        const { stop } = c.watchAll(apiCall);
        await flush();
        expect(apiCall).toHaveBeenCalledTimes(1);

        // simulates another store, sharing the client, invalidating this resource by name
        await c.queryClient.invalidateQueries({ queryKey: ['orders'] });
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(2); // genuinely refetched, not just marked stale
        stop();
    });

    it('watchByParent refetches on invalidation too', async () => {
        const c = makeComposable<IUser, number>({ resourceKey: 'orders' });
        const apiCall = jest.fn(() => Promise.resolve(buildUsers(2, 1)));

        const { stop } = c.watchByParent(apiCall, 'team-1');
        await flush();
        expect(apiCall).toHaveBeenCalledTimes(1);

        await c.queryClient.invalidateQueries({ queryKey: ['orders'] });
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(2);
        stop();
    });

    it("createTarget invalidating this resource's lists refetches an active watchAll automatically", async () => {
        const c = makeComposable<IUser, number>({ resourceKey: 'orders' });
        const listCall = jest.fn(() => Promise.resolve([...USERS]));

        const { stop } = c.watchAll(listCall);
        await flush();
        expect(listCall).toHaveBeenCalledTimes(1);

        await c.createTarget(apiResolve({ id: 4, name: 'Dave', email: 'dave@example.com' }));
        await flush();

        expect(listCall).toHaveBeenCalledTimes(2); // the active list picked up the new record on its own
        stop();
    });

    it("updateTarget invalidating this resource's lists refetches an active watchAll automatically", async () => {
        const c = makeComposable<IUser, number>({ resourceKey: 'orders' });
        const listCall = jest.fn(() => Promise.resolve([...USERS]));

        const { stop } = c.watchAll(listCall);
        await flush();
        expect(listCall).toHaveBeenCalledTimes(1);

        await c.updateTarget(apiResolve({ ...USERS[0], name: 'Alice 2' }), { name: 'Alice 2' }, 1);
        await flush();

        expect(listCall).toHaveBeenCalledTimes(2);
        stop();
    });

    it("deleteTarget invalidating this resource's lists refetches an active watchAll automatically", async () => {
        const c = makeComposable<IUser, number>({ resourceKey: 'orders' });
        const listCall = jest.fn(() => Promise.resolve([...USERS]));

        const { stop } = c.watchAll(listCall);
        await flush();
        expect(listCall).toHaveBeenCalledTimes(1);

        await c.deleteTarget(apiResolve({ ok: true }), 1);
        await flush();

        expect(listCall).toHaveBeenCalledTimes(2);
        stop();
    });

    it('invalidating a DIFFERENT resourceKey does not refetch this one', async () => {
        const c = makeComposable<IUser, number>({ resourceKey: 'orders' });
        const apiCall = jest.fn(() => Promise.resolve([...USERS]));

        const { stop } = c.watchAll(apiCall);
        await flush();
        expect(apiCall).toHaveBeenCalledTimes(1);

        await c.queryClient.invalidateQueries({ queryKey: ['products'] });
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(1); // untouched
        stop();
    });
});
