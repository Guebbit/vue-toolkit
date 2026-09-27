/**
 * UNIT — a failed fetch keeps whatever data was already cached.
 *
 * A record IS its query: removing the query after a failed refetch would delete the record from
 * every view over a transient network error. Only a query that never held data (a first fetch
 * that failed) is removed — it is nothing but an error marker.
 */

import { makeComposable, clearAllInstances, flush } from '../_helpers/harness';
import { apiReject, apiResolve } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

describe('UNIT · failed refetches', () => {
    it('a failed fetchTarget refetch keeps the cached record', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(USERS[0]), 1);

        await expect(c.fetchTarget(apiReject('500'), 1, { forced: true })).rejects.toThrow('500');

        expect(c.getRecord(1)).toEqual(USERS[0]);
    });

    it('a failed first fetchTarget leaves no entry behind', async () => {
        const c = makeComposable<IUser, number>();

        await expect(c.fetchTarget(apiReject(), 1)).rejects.toThrow();

        expect(
            c.queryClient.getQueryCache().find({ queryKey: ['resource', 'target', [], '1'] })
        ).toBeUndefined();
    });

    it('a failed fetchAll refetch keeps the cached list', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchAll(apiResolve(USERS));

        await expect(c.fetchAll(apiReject(), { forced: true })).rejects.toThrow();

        expect(c.queryClient.getQueryData(['resource', 'all', []])).toEqual({ ids: [1, 2, 3] });
        expect(c.itemList.value).toHaveLength(3);
    });

    it('a failed keyed fetchAny leaves no empty entry behind, so the next call retries', async () => {
        const c = makeComposable<IUser, number>();
        const retry = apiResolve('ok');

        await expect(c.fetchAny(apiReject(), { key: ['stats'] })).rejects.toThrow();
        await flush();

        await expect(c.fetchAny(retry, { key: ['stats'] })).resolves.toBe('ok');
        expect(retry).toHaveBeenCalledTimes(1);
    });
});
