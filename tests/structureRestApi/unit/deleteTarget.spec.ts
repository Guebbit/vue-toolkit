/**
 * UNIT — deleteTarget: direct contract of the optimistic delete.
 *   - removes the item immediately and resolves with the API response
 *   - rolls the item back on error
 *   - cancels an in-flight read of the same record before removing it
 */

import { makeComposable, clearAllInstances, flush } from '../_helpers/harness';
import { apiResolve, apiReject, deferredApi } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IUser, number>();

describe('UNIT · deleteTarget', () => {
    it('removes the item immediately and resolves with the API response', async () => {
        const c = make();
        await c.fetchAll(apiResolve([...USERS]));
        const ack = { success: true };
        await expect(c.deleteTarget(apiResolve(ack), 1)).resolves.toEqual(ack);
        expect(c.getRecord(1)).toBeUndefined();
        expect(c.itemList.value).toHaveLength(2);
    });

    it('rolls the item back on error', async () => {
        const c = make();
        await c.fetchAll(apiResolve([...USERS]));
        await expect(c.deleteTarget(apiReject(), 1)).rejects.toThrow();
        expect(c.getRecord(1)).toEqual(USERS[0]);
    });

    it('the deleted id must be fetched fresh if asked for again', async () => {
        const c = make();
        await c.fetchTarget(apiResolve(USERS[0]), 1);
        await c.deleteTarget(apiResolve({ ok: true }), 1);

        const get = apiResolve(USERS[0]);
        await c.fetchTarget(get, 1);
        expect(get).toHaveBeenCalledTimes(1);
    });

    it('a record restored after a failed delete keeps the freshness it had', async () => {
        const c = make();
        await c.fetchAll(apiResolve([...USERS])); // fresh
        await expect(c.deleteTarget(apiReject(), 1)).rejects.toThrow();

        const get = apiResolve(USERS[0]);
        await c.fetchTarget(get, 1);
        expect(get).not.toHaveBeenCalled(); // still fresh: served from cache
    });

    it('cancels an in-flight fetchTarget of the same id: the read resolves instead of rejecting', async () => {
        const c = make();
        await c.fetchTarget(apiResolve(USERS[0]), 1);
        const read = deferredApi<IUser>();
        const pendingRead = c.fetchTarget(read.call, 1, { forced: true });
        const remove = deferredApi<{ ok: boolean }>();

        const pendingDelete = c.deleteTarget(remove.call, 1);
        await flush();

        await expect(pendingRead).resolves.toEqual(USERS[0]); // what was cached when cancelled
        expect(c.getRecord(1)).toBeUndefined();

        remove.control.resolve({ ok: true });
        await pendingDelete;
    });

    // Same guard on delete: an older answer must not resurrect a record the server just deleted.
    it("the cancelled read's late answer does not resurrect the deleted record", async () => {
        const c = make();
        await c.fetchTarget(apiResolve(USERS[0]), 1);
        const read = deferredApi<IUser>();
        const pendingRead = c.fetchTarget(read.call, 1, { forced: true });

        await c.deleteTarget(apiResolve({ ok: true }), 1);
        read.control.resolve({ ...USERS[0], name: 'Older answer' });
        await pendingRead;
        await flush();

        expect(c.getRecord(1)).toBeUndefined();
    });
});
