/**
 * MODIFIER — loading management variants.
 *   - external getLoading/setLoading store, keyed by loadingKey
 *   - per-call loadingKey POSTFIX tracks a separate sub-key (row vs table)
 *   - loading:false opts a call out entirely
 *   - loading resets to false even when the API rejects
 *   - loading is REF-COUNTED: concurrent fetches don't clear each other's state
 */

import { makeExternalLoading, makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve, apiReject, deferredApi } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

describe('MODIFIER · loading', () => {
    it('external store: flips the loadingKey entry during a fetch and back after', async () => {
        const { c, store } = makeExternalLoading<IUser, number>('users');
        let during = false;
        await c.fetchAll(
            jest.fn(() => {
                during = store['users'] === true;
                return Promise.resolve([...USERS]);
            })
        );
        expect(during).toBe(true);
        expect(store['users']).toBe(false);
    });

    it('per-call loadingKey postfix tracks a sub-key, leaving the base key untouched', async () => {
        const { c, store } = makeExternalLoading<IUser, number>('users');
        let baseDuring = true;
        let postfixDuring = false;
        await c.fetchAll(
            jest.fn(() => {
                baseDuring = store['users'] === true;
                postfixDuring = store['users-row-1'] === true;
                return Promise.resolve([...USERS]);
            }),
            { loadingKey: '-row-1' }
        );
        expect(baseDuring).toBe(false);
        expect(postfixDuring).toBe(true);
        expect(store['users-row-1']).toBe(false);
    });

    it('loading:false leaves the internal flag false throughout', async () => {
        const c = makeComposable<IUser, number>();
        let during = true;
        await c.fetchAll(
            jest.fn(() => {
                during = c.loading.value as boolean;
                return Promise.resolve([...USERS]);
            }),
            { loading: false }
        );
        expect(during).toBe(false);
        expect(c.loading.value).toBe(false);
    });

    it('loading resets to false after the API rejects', async () => {
        const c = makeComposable<IUser, number>();
        await expect(c.fetchAll(apiReject(), { forced: true })).rejects.toThrow();
        expect(c.loading.value).toBe(false);
    });

    it('external store: loading resets to false after a rejection', async () => {
        const { c, store } = makeExternalLoading<IUser, number>('users');
        await expect(c.fetchAll(apiReject(), { forced: true })).rejects.toThrow();
        expect(store['users']).toBe(false);
    });

    it('deleteTarget honours loading:false (no loading toggle)', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchAll(apiResolve([...USERS]));
        let during = true;
        await c.deleteTarget(
            jest.fn(() => {
                during = c.loading.value as boolean;
                return Promise.resolve({ ok: true });
            }),
            1,
            { loading: false }
        );
        expect(during).toBe(false);
    });

    it('stays true while a concurrent fetch is still pending (ref-counted)', async () => {
        const c = makeComposable<IUser, number>();
        const a = deferredApi<IUser[]>();
        const b = deferredApi<IUser[]>();
        // two independent fetches (different keys → both actually run)
        const p1 = c.fetchAll(a.call, { lastUpdateKey: 'A' });
        const p2 = c.fetchAll(b.call, { lastUpdateKey: 'B' });
        // Should an assertion below throw, the test aborts with a fetch still in flight;
        // afterEach's destroy() then clears the client and TanStack rejects it with a
        // CancelledError. Pre-attach handlers so that rejection is never unhandled — an
        // unhandled one kills the Jest worker and hides every other result in this file.
        p1.catch(() => {});
        p2.catch(() => {});
        expect(c.loading.value).toBe(true);

        a.control.resolve([...USERS]);
        await p1;
        // b is still in flight, so loading MUST still be true: a boolean flag would
        // have been cleared here by whichever fetch resolved first.
        expect(c.loading.value).toBe(true);

        b.control.resolve([...USERS]);
        await p2;
        expect(c.loading.value).toBe(false);
    });
});
