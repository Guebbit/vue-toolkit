/**
 * UNIT — fetchAny: direct contract of the generic wrapper.
 *
 * fetchAny wraps ANY async call returning ANY shape. Its direct job:
 *   - resolve with the call's result
 *   - cache ONLY when a key is given (opt-in), keyed per key
 *   - honour forced; a failed first call leaves no entry behind, so a retry runs
 *   - a cancelled keyed call resolves what its entry already held
 *   - count toward isLoading() while in flight, key or no key
 */

import { makeComposable, clearAllInstances, flush } from '../_helpers/harness';
import { apiReject, apiResolve, deferredApi } from '../_helpers/fakeApi';
import type { IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IUser, number>();

describe('UNIT · fetchAny', () => {
    it('resolves with the call result (object shape)', async () => {
        const c = make();
        const stats = { total: 42, active: 7 };
        await expect(c.fetchAny(jest.fn(() => Promise.resolve(stats)))).resolves.toEqual(stats);
    });

    it('resolves with a primitive shape (health-check boolean)', async () => {
        const c = make();
        await expect(c.fetchAny(jest.fn(() => Promise.resolve(true)))).resolves.toBe(true);
    });

    it('WITHOUT a key runs the call every time (no caching)', async () => {
        const c = make();
        const first = jest.fn(() => Promise.resolve(1));
        const second = jest.fn(() => Promise.resolve(2));
        await c.fetchAny(first);
        await c.fetchAny(second);
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('WITH a key serves the second identical call from cache', async () => {
        const c = make();
        const first = jest.fn(() => Promise.resolve(1));
        const second = jest.fn(() => Promise.resolve(2));
        await c.fetchAny(first, { key: ['stats'] });
        const result = await c.fetchAny(second, { key: ['stats'] });
        expect(second).not.toHaveBeenCalled();
        expect(result).toBe(1);
    });

    it('treats different keys as independent buckets', async () => {
        const c = make();
        const a = jest.fn(() => Promise.resolve('a'));
        const b = jest.fn(() => Promise.resolve('b'));
        await c.fetchAny(a, { key: ['endpoint-a'] });
        await c.fetchAny(b, { key: ['endpoint-b'] });
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);
    });

    it('forced bypasses a cached entry', async () => {
        const c = make();
        const first = jest.fn(() => Promise.resolve(1));
        const second = jest.fn(() => Promise.resolve(2));
        await c.fetchAny(first, { key: ['stats'] });
        await c.fetchAny(second, { key: ['stats'], forced: true });
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('re-throws the error', async () => {
        const c = make();
        await expect(c.fetchAny(apiReject('boom'))).rejects.toThrow('boom');
    });

    it('a failed first call leaves no cache entry behind, so the next call retries', async () => {
        const c = make();
        await expect(c.fetchAny(apiReject(), { key: ['stats'] })).rejects.toThrow();
        expect(
            c.queryClient.getQueryCache().find({ queryKey: ['resource', 'any', [], 'stats'] })
        ).toBeUndefined();
        const retry = jest.fn(() => Promise.resolve('ok'));
        await expect(c.fetchAny(retry, { key: ['stats'] })).resolves.toBe('ok');
        expect(retry).toHaveBeenCalledTimes(1);
    });

    it('a cancelled keyed refresh resolves what the entry already held instead of rejecting', async () => {
        const c = make();
        await c.fetchAny(apiResolve('v1'), { key: ['stats'] });
        const pending = c.fetchAny(deferredApi<string>().call, { key: ['stats'], forced: true });
        await flush();

        // TanStack: revert false fails the fetch with a CancelledError and keeps the entry's data
        await c.queryClient.cancelQueries({ queryKey: ['resource', 'any'] }, { revert: false });

        await expect(pending).resolves.toBe('v1');
    });

    it('counts toward isLoading() during the call, key or no key', async () => {
        const c = make();
        let duringNoKey = false;
        await c.fetchAny(
            jest.fn(() => {
                duringNoKey = c.isLoading();
                return Promise.resolve(1);
            })
        );
        expect(duringNoKey).toBe(true);
        expect(c.isLoading()).toBe(false);

        let duringWithKey = false;
        await c.fetchAny(
            jest.fn(() => {
                duringWithKey = c.isLoading(['stats']);
                return Promise.resolve(1);
            }),
            { key: ['stats'] }
        );
        expect(duringWithKey).toBe(true);
        expect(c.isLoading(['stats'])).toBe(false);
    });
});
