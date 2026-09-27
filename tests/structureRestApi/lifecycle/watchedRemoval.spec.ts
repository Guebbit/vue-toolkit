/**
 * LIFECYCLE — dropping queries never strands a watcher.
 *
 * TanStack never tells an observer that its query left the cache, so removing a watched query
 * detached its watcher for good: invalidation and window focus only reach queries still cached.
 * A watched query is reset in place instead — the watcher stays attached, and resetAll() has it
 * fetch again.
 */

import { ref } from 'vue';
import { makeComposable, clearAllInstances, flush } from '../_helpers/harness';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

describe('LIFECYCLE · dropping watched queries', () => {
    it('resetAll() refetches what an active watchAll shows', async () => {
        const c = makeComposable<IUser, number>();
        const apiCall = jest.fn(() => Promise.resolve(USERS));
        c.watchAll(apiCall);
        await flush();

        c.resetAll();
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(2);
        expect(c.itemList.value).toHaveLength(3);
    });

    it('after resetRecords(), invalidation still reaches an active watchTarget', async () => {
        const c = makeComposable<IUser, number>();
        const apiCall = jest.fn(() => Promise.resolve(USERS[0]));
        c.watchTarget(ref(1), apiCall);
        await flush();

        c.resetRecords();
        expect(c.getRecord(1)).toBeUndefined();
        await c.queryClient.invalidateQueries({ queryKey: ['resource'] });
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(2);
        expect(c.getRecord(1)).toEqual(USERS[0]);
    });

    it('a failed deleteTarget of a watched record leaves its watcher attached, and reconciles it', async () => {
        const c = makeComposable<IUser, number>();
        const apiCall = jest.fn(() => Promise.resolve(USERS[0]));
        c.watchTarget(ref(1), apiCall);
        await flush();

        await expect(c.deleteTarget(() => Promise.reject(new Error('409')), 1)).rejects.toThrow();
        await flush();

        // the rollback invalidates the record; the still-attached watcher refetches it on its own
        expect(apiCall).toHaveBeenCalledTimes(2);
        expect(c.getRecord(1)).toEqual(USERS[0]);
    });
});
