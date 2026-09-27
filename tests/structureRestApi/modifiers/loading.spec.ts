/**
 * MODIFIER — isLoading(): rejection and concurrency behaviour.
 *   - isLoading() resets to false even when the API rejects
 *   - isLoading() reflects a count, not a boolean: concurrent fetches don't clear
 *     each other's state, mirroring TanStack's own isFetching()/isMutating() counts
 *
 * isLoading is derived from TanStack's own in-flight queries and mutations: every call counts.
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiReject, deferredApi } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

describe('MODIFIER · isLoading', () => {
    it('resets to false after the API rejects', async () => {
        const c = makeComposable<IUser, number>();
        await expect(c.fetchAll(apiReject(), { forced: true })).rejects.toThrow();
        expect(c.isLoading()).toBe(false);
    });

    it('stays true while a concurrent fetch is still pending', async () => {
        const c = makeComposable<IUser, number>();
        const a = deferredApi<IUser[]>();
        const b = deferredApi<IUser[]>();
        // two independent fetches (different keys → both actually run)
        const p1 = c.fetchAll(a.call, { key: ['A'] });
        const p2 = c.fetchAll(b.call, { key: ['B'] });
        // Should an assertion below throw, the test aborts with a fetch still in flight;
        // afterEach's clearAllInstances() then stops the scope and clears the client, and
        // TanStack rejects the still-pending fetch with a CancelledError. Pre-attach handlers
        // so that rejection is never unhandled — an unhandled one kills the Jest worker and
        // hides every other result in this file.
        p1.catch(() => {});
        p2.catch(() => {});
        expect(c.isLoading()).toBe(true);

        a.control.resolve([...USERS]);
        await p1;
        // b is still in flight, so isLoading() MUST still be true: a boolean flag would
        // have been cleared here by whichever fetch resolved first.
        expect(c.isLoading()).toBe(true);

        b.control.resolve([...USERS]);
        await p2;
        expect(c.isLoading()).toBe(false);
    });
});
