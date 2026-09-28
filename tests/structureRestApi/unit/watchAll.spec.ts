/**
 * UNIT — watchAll: fetchAll's active counterpart. Stays on screen without an imperative
 * fetch call: fires immediately, populates the dictionary the same way fetchAll does, and
 * `stop()` actually stops it reacting to further changes.
 * (Invalidation/dependsOn reactivity are covered in intention/invalidation-refetch.spec.ts
 * and lifecycle/dependsOn.spec.ts — this file is the direct, one-shape-at-a-time contract.)
 */

import { ref } from 'vue';
import { makeComposable, clearAllInstances, flush } from '../_helpers/harness';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IUser, number>();

describe('UNIT · watchAll', () => {
    it('fires immediately and populates the dictionary', async () => {
        const c = make();
        const apiCall = jest.fn(() => Promise.resolve([...USERS]));
        const { stop } = c.watchAll(apiCall);

        expect(apiCall).toHaveBeenCalledTimes(1);
        await flush();
        expect(c.itemList.value).toHaveLength(3);
        stop();
    });

    it('returns { stop, refetch }; refetch() resolves the current items', async () => {
        const c = make();
        const apiCall = jest.fn(() => Promise.resolve([USERS[0]]));
        const { stop, refetch } = c.watchAll(apiCall);
        await flush();

        await expect(refetch()).resolves.toEqual([USERS[0]]);
        expect(apiCall).toHaveBeenCalledTimes(2); // refetch() always re-runs, ignoring staleTime
        stop();
    });

    it('stop() stops it from reacting to further cache activity', async () => {
        const c = make();
        const apiCall = jest.fn(() => Promise.resolve([USERS[0]]));
        const { stop } = c.watchAll(apiCall);
        await flush();
        stop();

        await c.queryClient.invalidateQueries({ queryKey: ['resource'] });
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(1); // no refetch after teardown
    });

    it('skips undefined entries, same as fetchAll', async () => {
        const c = make();
        const { stop } = c.watchAll(() => Promise.resolve([USERS[0], undefined, USERS[1]]));
        await flush();

        expect(c.itemList.value).toHaveLength(2);
        stop();
    });

    it('a `key` setting namespaces independent instances', async () => {
        const c = make();
        const a = jest.fn(() => Promise.resolve([USERS[0]]));
        const b = jest.fn(() => Promise.resolve([USERS[1]]));

        const first = c.watchAll(a, { key: ['a'] });
        const second = c.watchAll(b, { key: ['b'] });
        await flush();

        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);
        first.stop();
        second.stop();
    });

    // enabled and key may be reactive.
    it('accepts enabled: false, and starts fetching once it flips true', async () => {
        const c = make();
        const enabled = ref(false);
        const apiCall = jest.fn(() => Promise.resolve([...USERS]));
        const { stop } = c.watchAll(apiCall, { enabled });
        await flush();

        expect(apiCall).not.toHaveBeenCalled();

        enabled.value = true;
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(1);
        stop();
    });

    it('accepts a reactive key, and re-runs when it changes', async () => {
        const c = make();
        const key = ref(['a']);
        const apiCall = jest.fn(() => Promise.resolve([...USERS]));
        const { stop } = c.watchAll(apiCall, { key });
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(1);

        key.value = ['b'];
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(2);
        stop();
    });
});
