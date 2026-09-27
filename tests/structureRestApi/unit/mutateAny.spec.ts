/**
 * UNIT — mutateAny: a command that doesn't fit createTarget/updateTarget/deleteTarget's
 * record shape, run as a one-shot TanStack mutation.
 *   - resolves with apiCall's result, rejects on failure
 *   - contributes to isLoading(key) while in flight
 *   - does NOT auto-invalidate anything on success — it has no defined relationship to any
 *     record or list, so a list fetched before stays cached after a mutateAny call
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { deferredApi } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IUser, number>();

describe('UNIT · mutateAny', () => {
    it('resolves with the apiCall result', async () => {
        const c = make();
        await expect(c.mutateAny(() => Promise.resolve({ ok: true }))).resolves.toEqual({
            ok: true
        });
    });

    it('rejects when the apiCall rejects', async () => {
        const c = make();
        await expect(c.mutateAny(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    });

    it('contributes to isLoading(key) while in flight, and settles back to false', async () => {
        const c = make();
        const { call, control } = deferredApi<{ ok: boolean }>();

        const pending = c.mutateAny(call, { key: ['setup'] });
        expect(c.isLoading(['setup'])).toBe(true);
        expect(c.isLoading(['unrelated'])).toBe(false);

        control.resolve({ ok: true });
        await pending;

        expect(c.isLoading(['setup'])).toBe(false);
    });

    it("does NOT invalidate this resource's cached lists on success", async () => {
        const c = make();
        const list = jest.fn(() => Promise.resolve([...USERS]));
        await c.fetchAll(list);
        expect(list).toHaveBeenCalledTimes(1);

        await c.mutateAny(() => Promise.resolve({ ok: true }));
        await c.fetchAll(list);

        expect(list).toHaveBeenCalledTimes(1); // still cached — mutateAny touched nothing
    });

    it('does not leak a dangling mutation observer (reset() runs even on rejection)', async () => {
        const c = make();
        await c.mutateAny(() => Promise.reject(new Error('boom'))).catch(() => {});

        // A leaked one-shot MutationObserver keeps its mutation permanently visible to
        // isMutating() — if reset() didn't run, this would still read true long after the
        // call settled.
        expect(c.isLoading()).toBe(false);
    });
});
