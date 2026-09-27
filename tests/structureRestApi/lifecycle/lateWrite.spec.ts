/**
 * LIFECYCLE — the late-write guard: every write uses the dependsOn captured when its call
 * started, and is skipped if it has changed since.
 *
 * A fetch/mutation started under dependsOn A that resolves AFTER dependsOn has already
 * moved to B must not write anything under A — A's queries were already cancelled and
 * removed by the dependsOn watcher, and a late write would silently resurrect them,
 * leaking the old context's data into memory after the switch already cleaned it up.
 */

import { ref } from 'vue';
import { makeComposable, clearAllInstances, flush } from '../_helpers/harness';
import { deferredApi } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

describe('LIFECYCLE · late writes after a dependsOn change', () => {
    it('a fetchTarget in flight when dependsOn changes does not resurrect a record under the old value', async () => {
        const userId = ref('alice');
        const c = makeComposable<IUser, number>({ dependsOn: () => [userId.value] });
        const { call, control } = deferredApi<IUser | undefined>();

        const pending = c.fetchTarget(call, 1); // started under 'alice', not yet resolved

        userId.value = 'bob'; // dependsOn moves on before the response arrives
        await flush();

        control.resolve(USERS[0]); // the late response finally arrives
        await pending;

        // still nothing under 'bob' (this response belongs to 'alice', whose scope was removed)
        expect(c.getRecord(1)).toBeUndefined();
        expect(c.itemList.value).toHaveLength(0);

        // and switching back to 'alice' doesn't resurrect it either — the late write was
        // dropped, not just deferred
        userId.value = 'alice';
        await flush();
        expect(c.getRecord(1)).toBeUndefined();
    });

    it("fetchTarget's id-less path also drops a response that resolves after dependsOn moved on", async () => {
        const userId = ref('alice');
        const c = makeComposable<IUser, number>({ dependsOn: () => [userId.value] });
        const { call, control } = deferredApi<IUser>();

        const pending = c.fetchTarget(call); // no id yet — the id-less branch
        userId.value = 'bob';
        await flush();

        control.resolve(USERS[0]);
        await pending;

        expect(c.getRecord(1)).toBeUndefined();
    });

    it('a fetchAll in flight when dependsOn changes does not seed any records under the old value', async () => {
        const locale = ref('en');
        const c = makeComposable<IUser, number>({ dependsOn: () => [locale.value] });
        const { call, control } = deferredApi<IUser[]>();

        const pending = c.fetchAll(call);
        locale.value = 'fr';
        await flush();

        control.resolve([...USERS]);
        await pending;

        expect(c.itemList.value).toHaveLength(0);
    });

    it('an updateTarget in flight when dependsOn changes does not apply its response under the old value', async () => {
        const userId = ref('alice');
        const c = makeComposable<IUser, number>({ dependsOn: () => [userId.value] });
        await c.fetchTarget(() => Promise.resolve(USERS[0]), 1);

        const { call, control } = deferredApi<IUser>();
        const pending = c.updateTarget(call, { name: 'Optimistic' }, 1);
        // the optimistic write applies after updateTarget's leading cancelQueries() microtask,
        // not synchronously — that part is legitimate, it's the SERVER'S late response we're
        // guarding against below
        await flush();
        expect(c.getRecord(1)?.name).toBe('Optimistic');

        userId.value = 'bob';
        await flush();
        // the dependsOn switch already tore down 'alice' entirely, optimistic edit included
        expect(c.getRecord(1)).toBeUndefined();

        control.resolve({ ...USERS[0], name: 'Server Won' });
        await pending;

        // the late server response must not resurrect anything under either value
        expect(c.getRecord(1)).toBeUndefined();
        userId.value = 'alice';
        await flush();
        expect(c.getRecord(1)).toBeUndefined();
    });
});
