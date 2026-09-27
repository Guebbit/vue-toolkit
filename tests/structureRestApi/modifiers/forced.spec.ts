/**
 * MODIFIER — forced: bypass a still-fresh cache entry and re-hit the API.
 * Covered across every cached fetch method, plus that the refreshed value
 * actually replaces the previously cached one — and that a forced call JOINS a
 * request already running for the same data instead of racing it.
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve, deferredApi } from '../_helpers/fakeApi';
import { USERS, buildUsers, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

describe('MODIFIER · forced', () => {
    it('fetchAll: forced re-hits the API', async () => {
        const c = makeComposable<IUser, number>();
        const first = apiResolve([...USERS]);
        const second = apiResolve([...USERS]);
        await c.fetchAll(first);
        await c.fetchAll(second, { forced: true });
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('fetchTarget: forced re-hits the API and replaces the value', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(USERS[0]), 1);
        await c.fetchTarget(apiResolve({ ...USERS[0], name: 'Alice V2' }), 1, { forced: true });
        expect(c.getRecord(1)?.name).toBe('Alice V2');
    });

    it('fetchByParent: forced re-hits the API', async () => {
        const c = makeComposable<IUser, number>();
        const first = apiResolve(buildUsers(3, 1));
        const second = apiResolve(buildUsers(3, 1));
        await c.fetchByParent(first, 'team-1');
        await c.fetchByParent(second, 'team-1', { forced: true });
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('fetchMultiple: forced re-fetches even the cached ids', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(USERS[0]), 1);
        const batch = apiResolve([USERS[0], USERS[1]]);
        const result = await c.fetchMultiple(batch, [1, 2], { forced: true });
        expect(batch).toHaveBeenCalledTimes(1);
        expect(result.some((u) => u?.id === 1)).toBe(true);
        expect(result.some((u) => u?.id === 2)).toBe(true);
    });

    it('fetchAny: forced re-hits the API', async () => {
        const c = makeComposable<IUser, number>();
        const first = jest.fn(() => Promise.resolve(1));
        const second = jest.fn(() => Promise.resolve(2));
        await c.fetchAny(first, { key: ['k'] });
        await c.fetchAny(second, { key: ['k'], forced: true });
        expect(second).toHaveBeenCalledTimes(1);
    });
});

describe('MODIFIER · forced joins a concurrent call for the same data', () => {
    it('fetchAll: a forced call joins a non-forced one already running — one apiCall, both resolve', async () => {
        const c = makeComposable<IUser, number>();
        const { call, control } = deferredApi<IUser[]>();

        const plain = c.fetchAll(call);
        const forced = c.fetchAll(call, { forced: true });
        control.resolve([...USERS]);

        await expect(plain).resolves.toEqual(USERS);
        await expect(forced).resolves.toEqual(USERS);
        expect(call).toHaveBeenCalledTimes(1);
    });

    it('fetchAll: a non-forced call joins a forced one already running', async () => {
        const c = makeComposable<IUser, number>();
        const { call, control } = deferredApi<IUser[]>();

        const forced = c.fetchAll(call, { forced: true });
        const plain = c.fetchAll(call);
        control.resolve([...USERS]);

        await expect(forced).resolves.toEqual(USERS);
        await expect(plain).resolves.toEqual(USERS);
        expect(call).toHaveBeenCalledTimes(1);
    });

    it('fetchTarget: a forced read joins a read of the same id already running', async () => {
        const c = makeComposable<IUser, number>();
        const { call, control } = deferredApi<IUser>();

        const plain = c.fetchTarget(call, 1);
        const forced = c.fetchTarget(call, 1, { forced: true });
        control.resolve(USERS[0]);

        await expect(plain).resolves.toEqual(USERS[0]);
        await expect(forced).resolves.toEqual(USERS[0]);
        expect(call).toHaveBeenCalledTimes(1);
    });
});
