/**
 * UNIT — isLoading(key) tagging beyond fetchAny (already covered in unit/loading.spec.ts):
 * createTarget/updateTarget/deleteTarget and the watch* family all stamp their TanStack
 * call's `meta` with the caller's `key`, which is what lets a consumer ask "is THIS
 * specific save/save-button busy" instead of "is anything on this resource busy".
 */

import { makeComposable, clearAllInstances, flush } from '../_helpers/harness';
import { deferredApi } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IUser, number>();

describe('UNIT · isLoading(key) tagging on mutations and watch*', () => {
    it('createTarget tags isLoading with its key', async () => {
        const c = make();
        const { call, control } = deferredApi<IUser>();
        const pending = c.createTarget(call, undefined, { key: ['save'] });

        expect(c.isLoading(['save'])).toBe(true);
        expect(c.isLoading(['unrelated'])).toBe(false);

        control.resolve(USERS[0]);
        await pending;
        expect(c.isLoading(['save'])).toBe(false);
    });

    it('updateTarget tags isLoading with its key', async () => {
        const c = make();
        await c.fetchTarget(() => Promise.resolve(USERS[0]), 1);
        const { call, control } = deferredApi<IUser>();
        const pending = c.updateTarget(call, { name: 'x' }, 1, { key: ['save'] });
        await flush(); // updateTarget's mutation is built after a leading cancelQueries microtask

        expect(c.isLoading(['save'])).toBe(true);
        expect(c.isLoading(['unrelated'])).toBe(false);

        control.resolve(USERS[0]);
        await pending;
    });

    it('deleteTarget tags isLoading with its key', async () => {
        const c = make();
        await c.fetchTarget(() => Promise.resolve(USERS[0]), 1);
        const { call, control } = deferredApi<{ ok: boolean }>();
        const pending = c.deleteTarget(call, 1, { key: ['save'] });
        await flush();

        expect(c.isLoading(['save'])).toBe(true);
        expect(c.isLoading(['unrelated'])).toBe(false);

        control.resolve({ ok: true });
        await pending;
    });

    it('watchAll tags isLoading with its key', async () => {
        const c = make();
        const { call, control } = deferredApi<IUser[]>();
        const { stop } = c.watchAll(call, { key: ['dashboard'] });

        expect(c.isLoading(['dashboard'])).toBe(true);
        expect(c.isLoading(['unrelated'])).toBe(false);

        control.resolve([...USERS]);
        await flush();
        expect(c.isLoading(['dashboard'])).toBe(false);
        stop();
    });
});
