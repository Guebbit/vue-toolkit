/**
 * LIFECYCLE — dependsOn: the values a resource's data depends on (whose data, which
 * language). The next user never sees the previous user's data, and a language switch
 * re-fetches the pages on screen.
 *
 *   - a dependsOn change cancels + removes this resource's queries under the OLD
 *     value, records included — the old context's data actually leaves memory
 *   - fetching again under a NEW value is independent of what was under the old one
 *   - an ACTIVE watchTarget/watchAll re-fetches on its own when dependsOn changes
 *
 * Late answers from the old context: lateWrite.spec.ts / lateRollback.spec.ts. Another
 * resource on the same client: intention/resource-isolation.spec.ts.
 */

import { ref } from 'vue';
import { makeComposable, clearAllInstances, flush } from '../_helpers/harness';
import { apiResolve, deferred } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

describe('LIFECYCLE · dependsOn', () => {
    it('a change cancels and removes queries under the OLD value, records included', async () => {
        const userId = ref('alice');
        const c = makeComposable<IUser, number>({ dependsOn: () => [userId.value] });

        await c.fetchTarget(apiResolve(USERS[0]), 1);
        expect(c.getRecord(1)).toEqual(USERS[0]);

        userId.value = 'bob';
        await flush();

        // alice's data is gone — the old user's records left memory, not just "went stale".
        // The view already filters by the current dependsOn, so ask the cache directly.
        expect(c.queryClient.getQueryData(['resource', 'target', ['alice'], '1'])).toBeUndefined();
        expect(c.queryClient.getQueryCache().findAll({ queryKey: ['resource'] })).toHaveLength(0);
        expect(c.getRecord(1)).toBeUndefined();
        expect(c.itemList.value).toHaveLength(0);
    });

    it('fetching under the NEW value is independent of what was cached under the old one', async () => {
        const userId = ref('alice');
        const c = makeComposable<IUser, number>({ dependsOn: () => [userId.value] });

        await c.fetchAll(apiResolve([USERS[0]]));
        expect(c.itemList.value).toHaveLength(1);

        userId.value = 'bob';
        await flush();

        const bobsUsers = apiResolve([USERS[1], USERS[2]]);
        await c.fetchAll(bobsUsers);
        expect(c.itemList.value).toHaveLength(2);
        expect(c.itemList.value.map((u) => u.id)).toEqual([2, 3]);

        // switching back to alice doesn't resurrect her old cache either — it was removed,
        // not merely hidden
        userId.value = 'alice';
        await flush();
        expect(c.itemList.value).toHaveLength(0);
    });

    it('an ACTIVE watchTarget re-fetches on its own when dependsOn changes', async () => {
        const userId = ref('alice');
        const c = makeComposable<IUser, number>({ dependsOn: () => [userId.value] });
        const apiCall = jest.fn(() => Promise.resolve(USERS[0]));

        const { stop } = c.watchTarget(apiCall, () => 1);
        await flush();
        expect(apiCall).toHaveBeenCalledTimes(1);

        userId.value = 'bob';
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(2); // re-ran under the new dependsOn, unprompted
        stop();
    });

    it('an ACTIVE watchAll re-fetches on its own when dependsOn changes', async () => {
        const locale = ref('en');
        const c = makeComposable<IUser, number>({ dependsOn: () => [locale.value] });
        const apiCall = jest.fn(() => Promise.resolve([USERS[0]]));

        const { stop } = c.watchAll(apiCall);
        await flush();
        expect(apiCall).toHaveBeenCalledTimes(1);

        locale.value = 'fr';
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(2);
        stop();
    });

    it("an ACTIVE watchTarget's own new-context fetch is not clobbered by the OLD context's late answer", async () => {
        // watchTarget reactively re-fetches under the new dependsOn as soon as it changes (already
        // covered above) — so the only way to observe the guard doing real work is to give the OLD
        // and NEW fetches distinguishable answers and check the late (old) one loses.
        const userId = ref('alice');
        const c = makeComposable<IUser, number>({ dependsOn: () => [userId.value] });
        const aliceAnswer = deferred<IUser>();
        const bobsAnswer: IUser = { id: 1, name: 'Bob Version', email: 'bob@x.com' };
        let calls = 0;
        const apiCall = jest.fn(() =>
            calls++ === 0 ? aliceAnswer.promise : Promise.resolve(bobsAnswer)
        );

        const { stop } = c.watchTarget(apiCall, () => 1);
        await flush(); // alice's fetch starts and hangs

        userId.value = 'bob';
        await flush(); // bob's own re-fetch runs and resolves immediately

        expect(c.getRecord(1)).toEqual(bobsAnswer);

        aliceAnswer.resolve(USERS[0]); // alice's stale answer finally arrives
        await flush();

        expect(c.getRecord(1)).toEqual(bobsAnswer); // still bob's — alice's late answer lost
        stop();
    });

    it('a defensive no-op: a getter re-invoked with a deep-equal result does not tear anything down', async () => {
        // dependsOn returns a NEW array literal each time, but with the SAME values —
        // this must not be treated as a real change.
        const sessionRef = ref({ id: 'alice' });
        const c = makeComposable<IUser, number>({ dependsOn: () => [sessionRef.value.id] });

        await c.fetchTarget(apiResolve(USERS[0]), 1);
        expect(c.getRecord(1)).toEqual(USERS[0]);

        sessionRef.value = { id: 'alice' }; // new object, same id — dependsOn's OWN output is equal
        await flush();

        expect(c.getRecord(1)).toEqual(USERS[0]); // still there — nothing was torn down
    });
});
