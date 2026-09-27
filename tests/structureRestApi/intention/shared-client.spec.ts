/**
 * INTENTION — sharing a QueryClient across composables.
 * Two composables that share BOTH a QueryClient and a resourceKey share cache
 * buckets (one fetch warms the other). A differing resourceKey namespaces them
 * apart even on the same client.
 */

import { makeShared, makeComposable, clearAllInstances, newTestClient } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

describe('INTENTION · shared QueryClient', () => {
    it('shared client + resourceKey: one composable warms the other', async () => {
        const { a, b } = makeShared<IUser, number>('users');
        const first = apiResolve([...USERS]);
        const second = apiResolve([...USERS]);
        await a.fetchAll(first, { key: ['roster'] });
        await b.fetchAll(second, { key: ['roster'] });
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).not.toHaveBeenCalled();
    });

    it('shared client + resourceKey: composable b sees a target seeded by a', async () => {
        const { a, b } = makeShared<IUser, number>('users');
        await a.fetchAll(apiResolve([...USERS]));
        const get = apiResolve(USERS[0]);
        await b.fetchTarget(get, 1);
        expect(get).not.toHaveBeenCalled();
    });

    it('same client but DIFFERENT resourceKey does not share', async () => {
        const client = newTestClient();
        const a = makeComposable<IUser, number>({ resourceKey: 'a', queryClient: client });
        const b = makeComposable<IUser, number>({ resourceKey: 'b', queryClient: client });
        const first = apiResolve([...USERS]);
        const second = apiResolve([...USERS]);
        await a.fetchAll(first, { key: ['roster'] });
        await b.fetchAll(second, { key: ['roster'] });
        expect(second).toHaveBeenCalledTimes(1);
    });
});
