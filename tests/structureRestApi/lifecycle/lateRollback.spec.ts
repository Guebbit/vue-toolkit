/**
 * LIFECYCLE — a rollback is a write too: it must obey the same late-write guard as a response.
 *
 * A mutation started under dependsOn A that FAILS after dependsOn moved to B (logout while a
 * save is in flight, then the request dies with a 401) must not restore A's record — the
 * restore would land under B, showing the previous user's data to the next one.
 */

import { ref } from 'vue';
import { makeComposable, clearAllInstances, flush } from '../_helpers/harness';
import { apiReject, apiResolve, deferredApi } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

describe('LIFECYCLE · rollbacks after a dependsOn change', () => {
    it('a failed updateTarget does not restore the old record under the new dependsOn', async () => {
        const userId = ref('alice');
        const c = makeComposable<IUser, number>({ dependsOn: () => [userId.value] });
        await c.fetchTarget(apiResolve(USERS[0]), 1);
        const { call, control } = deferredApi<IUser>();

        const pending = c.updateTarget(call, { name: 'Alice edited' }, 1).catch(() => {});
        await flush();
        userId.value = 'bob';
        await flush();
        control.reject(new Error('401'));
        await pending;

        expect(c.getRecord(1)).toBeUndefined();
        expect(c.itemList.value).toHaveLength(0);
    });

    it('a failed deleteTarget does not restore the old record under the new dependsOn', async () => {
        const userId = ref('alice');
        const c = makeComposable<IUser, number>({ dependsOn: () => [userId.value] });
        await c.fetchTarget(apiResolve(USERS[0]), 1);
        const { call, control } = deferredApi<unknown>();

        const pending = c.deleteTarget(call, 1).catch(() => {});
        await flush();
        userId.value = 'bob';
        await flush();
        control.reject(new Error('401'));
        await pending;

        expect(c.getRecord(1)).toBeUndefined();
    });

    it('under an unchanged dependsOn, both still roll back', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(USERS[0]), 1);

        await expect(c.updateTarget(apiReject(), { name: 'X' }, 1)).rejects.toThrow();
        expect(c.getRecord(1)).toEqual(USERS[0]);

        await expect(c.deleteTarget(apiReject(), 1)).rejects.toThrow();
        expect(c.getRecord(1)).toEqual(USERS[0]);
    });
});
