/**
 * UNIT — isSaving(id): a per-record pending signal for row spinners, distinct from the
 * whole-resource `loading`/`isLoading`.
 *   - false before anything happens
 *   - true for the record being updated, false for an unrelated one
 *   - `1` and `'1'` name one record; the same id in another resource is another record
 *   - true for the record being deleted
 *   - false again once the mutation settles, success or failure
 *   - a plain create (no id of its own to key by) never sets it
 */

import { makeComposable, clearAllInstances, flush, newTestClient } from '../_helpers/harness';
import { deferredApi } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IUser, number>();

describe('UNIT · isSaving', () => {
    it('is false initially', () => {
        const c = make();
        expect(c.isSaving(1)).toBe(false);
    });

    it('is true for the record being updated, false for an unrelated one', async () => {
        const c = make();
        await c.fetchTarget(() => Promise.resolve(USERS[0]), 1);
        const { call, control } = deferredApi<IUser>();

        const update = c.updateTarget(call, { name: 'Alice V2' }, 1);
        // updateTarget cancels the record's in-flight reads before registering the mutation, so
        // isSaving only turns true after that settles — not synchronously on the call itself.
        await flush();
        expect(c.isSaving(1)).toBe(true);
        expect(c.isSaving(2)).toBe(false);

        control.resolve({ ...USERS[0], name: 'Alice V2' });
        await update;
        expect(c.isSaving(1)).toBe(false);
    });

    it('is true for the record being deleted', async () => {
        const c = make();
        await c.fetchTarget(() => Promise.resolve(USERS[0]), 1);
        const { call, control } = deferredApi<void>();

        const remove = c.deleteTarget(call, 1);
        await flush();
        expect(c.isSaving(1)).toBe(true);

        control.resolve();
        await remove;
        expect(c.isSaving(1)).toBe(false);
    });

    it("a string id and a number id name one record: isSaving(1) is true during updateTarget(…, '1')", async () => {
        const c = makeComposable<IUser, number | string>();
        await c.fetchTarget(() => Promise.resolve(USERS[0]), 1);
        const { call, control } = deferredApi<IUser>();

        const update = c.updateTarget(call, { name: 'Alice V2' }, '1'); // a route param
        await flush();
        expect(c.isSaving(1)).toBe(true);

        control.resolve({ ...USERS[0], name: 'Alice V2' });
        await update;
    });

    it('is false for an update of the same id in another resource on the same client', async () => {
        const queryClient = newTestClient();
        const users = makeComposable<IUser, number>({ resourceKey: 'users', queryClient });
        const posts = makeComposable<IUser, number>({ resourceKey: 'posts', queryClient });
        await posts.fetchTarget(() => Promise.resolve(USERS[0]), 1);
        const { call, control } = deferredApi<IUser>();

        const update = posts.updateTarget(call, { name: 'Post V2' }, 1);
        await flush();
        expect(users.isSaving(1)).toBe(false);

        control.resolve({ ...USERS[0], name: 'Post V2' });
        await update;
    });

    it('is false again after a failed update', async () => {
        const c = make();
        await c.fetchTarget(() => Promise.resolve(USERS[0]), 1);

        await expect(
            c.updateTarget(() => Promise.reject(new Error('boom')), { name: 'x' }, 1)
        ).rejects.toThrow('boom');

        expect(c.isSaving(1)).toBe(false);
    });

    it('a plain create never sets isSaving for any id (no stable id of its own yet)', async () => {
        const c = make();
        const { call, control } = deferredApi<IUser>();

        const create = c.createTarget(call);
        await flush();
        expect(c.isSaving(1)).toBe(false);
        expect(c.isSaving(USERS[0].id)).toBe(false);

        control.resolve(USERS[0]);
        await create;
    });
});
