/**
 * UNIT — queryOptions: a narrow passthrough of TanStack's own useQuery options (retry,
 * retryDelay, refetchInterval, refetchOnWindowFocus, refetchOnReconnect) onto every ACTIVE
 * query a resource's watch* methods make.
 *   - set on the resource, it is the default for every watcher
 *   - set on a watcher's own settings, it overrides the resource's default for that call
 *   - the test harness's QueryClient defaults to retry: false, so retry: N here is only visible
 *     if the passthrough actually reaches TanStack's useQuery call
 */

import { ref } from 'vue';
import { makeComposable, clearAllInstances, flush } from '../_helpers/harness';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

describe('UNIT · queryOptions passthrough', () => {
    it('resource-level retry is the default for a watcher', async () => {
        const c = makeComposable<IUser, number>({
            queryOptions: { retry: 2, retryDelay: 0 }
        });
        const apiCall = jest.fn(() => Promise.reject(new Error('boom')));

        c.watchAll(apiCall);
        await flush(10);

        // 1 initial attempt + 2 retries
        expect(apiCall).toHaveBeenCalledTimes(3);
    });

    it('a watcher without its own queryOptions still uses the resource default', async () => {
        const c = makeComposable<IUser, number>({
            queryOptions: { retry: 1, retryDelay: 0 }
        });
        const apiCall = jest.fn((id: number) => Promise.reject(new Error(`boom ${id}`)));

        c.watchTarget(apiCall, ref(1));
        await flush(10);

        expect(apiCall).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    });

    it("a watcher's own queryOptions overrides the resource default", async () => {
        const c = makeComposable<IUser, number>({
            queryOptions: { retry: 2, retryDelay: 0 }
        });
        const apiCall = jest.fn(() => Promise.reject(new Error('boom')));

        c.watchAny(apiCall, { key: ['x'], queryOptions: { retry: 0 } });
        await flush(10);

        expect(apiCall).toHaveBeenCalledTimes(1); // the override wins: no retry
    });

    it('with no queryOptions at all, the QueryClient default (retry: false here) applies', async () => {
        const c = makeComposable<IUser, number>();
        const apiCall = jest.fn(() => Promise.reject(new Error('boom')));

        c.watchAll(apiCall);
        await flush(10);

        expect(apiCall).toHaveBeenCalledTimes(1);
    });

    it('does not affect fetchAll (a one-shot read, not an active watcher)', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchAll(() => Promise.resolve([...USERS]));
        expect(c.itemList.value).toEqual(USERS);
    });
});
