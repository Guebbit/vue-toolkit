/**
 * LIFECYCLE — a rollback is a write too: it must obey the same late-write guard as a response.
 *
 * A mutation started under dependsOn A that FAILS after dependsOn moved to B (logout while a
 * save is in flight, then the request dies with a 401) must not restore A's record — the
 * restore would land under B, showing the previous user's data to the next one.
 */

import { ref } from 'vue';
import type { QueryClient } from '@tanstack/vue-query';
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

/**
 * Spies on the client's `invalidateQueries` from now on.
 *
 * @param c - the composable whose client is watched
 * @returns the spy
 */
const watchInvalidations = (c: { queryClient: QueryClient }) =>
    jest.spyOn(c.queryClient, 'invalidateQueries');

describe('LIFECYCLE · an optimistic mutation whose scope died mid-flight', () => {
    it('a success writes nothing and invalidates nothing', async () => {
        const userId = ref('alice');
        const c = makeComposable<IUser, number>({ dependsOn: () => [userId.value] });
        await c.fetchTarget(apiResolve(USERS[0]), 1);
        const { call, control } = deferredApi<IUser>();

        const pending = c.updateTarget(call, { name: 'Alice edited' }, 1);
        await flush();
        userId.value = 'bob';
        await flush();
        const invalidations = watchInvalidations(c);
        control.resolve({ ...USERS[0], name: 'Alice confirmed' });
        await pending;

        expect(invalidations).not.toHaveBeenCalled();
        userId.value = 'alice';
        await flush();
        expect(c.getRecord(1)).toBeUndefined();
    });

    it('a failure neither rolls back nor invalidates', async () => {
        const userId = ref('alice');
        const c = makeComposable<IUser, number>({ dependsOn: () => [userId.value] });
        await c.fetchTarget(apiResolve(USERS[0]), 1);
        const { call, control } = deferredApi<IUser>();

        const pending = c.updateTarget(call, { name: 'Alice edited' }, 1).catch(() => {});
        await flush();
        userId.value = 'bob';
        await flush();
        const invalidations = watchInvalidations(c);
        control.reject(new Error('401'));
        await pending;

        expect(invalidations).not.toHaveBeenCalled();
        userId.value = 'alice';
        await flush();
        expect(c.getRecord(1)).toBeUndefined();
    });
});

describe('LIFECYCLE · createTarget placeholders and late answers', () => {
    it('the placeholder is on screen while in flight and gone once the real record lands', async () => {
        const c = makeComposable<IUser, number>();
        const { call, control } = deferredApi<IUser>();

        const pending = c.createTarget(call, { id: 99, name: 'Draft', email: 'd@e.com' });
        expect(c.itemList.value.map((item) => item.name)).toEqual(['Draft']);

        control.resolve(USERS[0]);
        await pending;

        expect(c.itemList.value).toEqual([USERS[0]]);
    });

    it('the placeholder is removed on failure too, and the error still surfaces', async () => {
        const c = makeComposable<IUser, number>();
        const { call, control } = deferredApi<IUser>();

        const pending = c.createTarget(call, { id: 99, name: 'Draft', email: 'd@e.com' });
        expect(c.itemList.value).toHaveLength(1);
        control.reject(new Error('nope'));

        await expect(pending).rejects.toThrow('nope');
        expect(c.itemList.value).toHaveLength(0);
    });

    it('a create resolving after its scope died returns the item and stores nothing', async () => {
        const userId = ref('alice');
        const c = makeComposable<IUser, number>({ dependsOn: () => [userId.value] });
        const { call, control } = deferredApi<IUser>();

        const pending = c.createTarget(call);
        userId.value = 'bob';
        await flush();
        const invalidations = watchInvalidations(c);
        control.resolve(USERS[0]);

        await expect(pending).resolves.toEqual(USERS[0]);
        expect(invalidations).not.toHaveBeenCalled();
        expect(c.getRecord(1)).toBeUndefined();
        userId.value = 'alice';
        await flush();
        expect(c.getRecord(1)).toBeUndefined();
    });
});

describe('LIFECYCLE · updateTarget with a response that is not a record', () => {
    it.each([
        ['a string', 'ok'],
        ['an array', [{ ...USERS[1] }]],
        // eslint-disable-next-line unicorn/no-null -- null is the body under test
        ['null', null]
    ])('%s is returned, and only the optimistic patch is stored', async (_label, body) => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(USERS[0]), 1);

        await expect(
            c.updateTarget(() => Promise.resolve(body), { name: 'Patched' }, 1)
        ).resolves.toBe(body);

        expect(c.getRecord(1)).toEqual({ ...USERS[0], name: 'Patched' });
        expect(c.getRecord(2)).toBeUndefined();
        expect(c.itemList.value).toHaveLength(1);
    });
});
