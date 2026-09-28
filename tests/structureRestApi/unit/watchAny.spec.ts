/**
 * UNIT — watchAny: fetchAny's active counterpart. Its answer isn't a record, so — unlike
 * every other watch* method — it also returns `data` (a computed over the query's own
 * result) instead of relying on the item dictionary.
 */

import { ref } from 'vue';
import { makeComposable, clearAllInstances, flush } from '../_helpers/harness';
import { type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IUser, number>();

describe('UNIT · watchAny', () => {
    it('fires immediately and exposes the result via `data`', async () => {
        const c = make();
        const apiCall = jest.fn(() => Promise.resolve({ ok: true, count: 3 }));
        const { stop, data } = c.watchAny(apiCall, { key: ['stats'] });

        expect(apiCall).toHaveBeenCalledTimes(1);
        await flush();
        expect(data.value).toEqual({ ok: true, count: 3 });
        stop();
    });

    it('exposes a rejection via `error`, without throwing', async () => {
        const c = make();
        const error = new Error('network error');
        const apiCall = jest.fn(() => Promise.reject(error));
        const { stop, error: errorRef } = c.watchAny(apiCall, { key: ['stats'] });
        await flush();

        expect(errorRef.value).toEqual(error);
        stop();
    });

    it('resolves undefined/void answers without throwing (TanStack forbids caching bare undefined)', async () => {
        const c = make();
        const apiCall = jest.fn(() => Promise.resolve());
        const { stop, data } = c.watchAny(apiCall, { key: ['ping'] });
        await flush();

        expect(data.value).toBeUndefined();
        stop();
    });

    it('two different keys are tracked independently', async () => {
        const c = make();
        const a = jest.fn(() => Promise.resolve('a-result'));
        const b = jest.fn(() => Promise.resolve('b-result'));

        const first = c.watchAny(a, { key: ['a'] });
        const second = c.watchAny(b, { key: ['b'] });
        await flush();

        expect(first.data.value).toBe('a-result');
        expect(second.data.value).toBe('b-result');
        first.stop();
        second.stop();
    });

    it('returns { stop, refetch } too', async () => {
        const c = make();
        const apiCall = jest.fn(() => Promise.resolve('v1'));
        const { stop, refetch } = c.watchAny(apiCall, { key: ['x'] });
        await flush();

        await refetch();
        expect(apiCall).toHaveBeenCalledTimes(2);
        stop();
    });

    // enabled and key may be reactive.
    it('accepts enabled: false, and starts fetching once it flips true', async () => {
        const c = make();
        const enabled = ref(false);
        const apiCall = jest.fn(() => Promise.resolve('v1'));
        const { stop } = c.watchAny(apiCall, { key: ['x'], enabled });
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
        const apiCall = jest.fn(() => Promise.resolve('v1'));
        const { stop } = c.watchAny(apiCall, { key });
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(1);

        key.value = ['b'];
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(2);
        stop();
    });
});
