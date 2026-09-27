/**
 * LIFECYCLE — the fetch that crosses maxRecords.
 *
 * Crossing the bound wipes the resource's current scope, but not the query doing the writing:
 * wiping it too would cancel the very call that triggered the wipe, which then resolved `[]`
 * with its list never cached. fetchMultiple writes batches too, so it obeys the bound as well.
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { buildUsers, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

describe('LIFECYCLE · crossing maxRecords', () => {
    it('the crossing fetchAll resolves its items and caches its list', async () => {
        const c = makeComposable<IUser, number>({ maxRecords: 3 });
        await c.fetchAll(apiResolve(buildUsers(2)), { key: ['a'] });

        const crossing = buildUsers(2, 3);
        const result = await c.fetchAll(apiResolve(crossing), { key: ['b'] });

        expect(result).toEqual(crossing);
        expect(c.queryClient.getQueryData(['resource', 'all', [], 'b'])).toEqual({ ids: [3, 4] });
        // everything else of the scope went
        expect(c.queryClient.getQueryData(['resource', 'all', [], 'a'])).toBeUndefined();
        expect(Object.keys(c.itemDictionary.value)).toEqual(['3', '4']);
    });

    it('fetchMultiple enforces the bound too', async () => {
        const c = makeComposable<IUser, number>({ maxRecords: 3 });
        await c.fetchAll(apiResolve(buildUsers(3)));

        const result = await c.fetchMultiple(apiResolve(buildUsers(2, 4)), [4, 5]);

        expect(result).toEqual(buildUsers(2, 4));
        expect(Object.keys(c.itemDictionary.value)).toEqual(['4', '5']);
    });
});

describe('LIFECYCLE · maxRecords counts only new records', () => {
    it('refetching a list bigger than half the bound does not wipe the scope', async () => {
        const c = makeComposable<IUser, number>({ maxRecords: 5 });
        await c.fetchAll(apiResolve(buildUsers(3)), { key: ['a'] });
        await c.fetchAll(apiResolve(buildUsers(2, 4)), { key: ['b'] });

        await c.fetchAll(apiResolve(buildUsers(3)), { key: ['a'], forced: true });

        expect(c.queryClient.getQueryData(['resource', 'all', [], 'b'])).toEqual({ ids: [4, 5] });
        expect(c.itemList.value).toHaveLength(5);
    });
});
