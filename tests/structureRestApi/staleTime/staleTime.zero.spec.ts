/**
 * staleTime — a staleTime of 0 means "never fresh": every call refetches, and every pre-flight
 * check reports a miss (TanStack counts data as stale once its age reaches staleTime). The
 * default 1-hour suite never exercises it.
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

describe('staleTime · a staleTime of 0 is never fresh', () => {
    it('fetchAll with staleTime 0 refetches every time', async () => {
        const c = makeComposable<IUser, number>({ staleTime: 0 });
        const first = apiResolve([...USERS]);
        const second = apiResolve([...USERS]);
        await c.fetchAll(first);
        await c.fetchAll(second);
        expect(second).toHaveBeenCalledTimes(1); // not served from cache
    });

    it('checkAll / checkTarget report a miss when staleTime is 0', async () => {
        const c = makeComposable<IUser, number>({ staleTime: 0 });
        await c.fetchAll(apiResolve([...USERS]));
        await c.fetchTarget(apiResolve(USERS[0]), 1);

        expect(c.checkAll()).toBe(false);
        expect(c.checkTarget(1)).toBe(false);
    });

    it('a per-call staleTime of 0 overrides a fresh default staleTime and forces a refetch', async () => {
        const c = makeComposable<IUser, number>(); // default 1h staleTime
        const first = apiResolve([...USERS]);
        const second = apiResolve([...USERS]);
        await c.fetchAll(first, { key: ['k'] });
        await c.fetchAll(second, { key: ['k'], staleTime: 0 });
        expect(second).toHaveBeenCalledTimes(1);
        expect(c.checkAll({ key: ['k'], staleTime: 0 })).toBe(false);
    });
});
