/**
 * LIFECYCLE — a mutation on one record must not disturb a read of the rest of the scope, and a
 * read that started before a mutation must not overwrite what the mutation leaves behind once it
 * lands late.
 *
 * Before the write guard (src/internal/writeGuard.ts), `updateTarget`/`deleteTarget` cancelled
 * every list read of the scope, not just the record's own — an unrelated in-flight `fetchAll`
 * would resolve `[]` and never retry. And nothing stopped a read's late answer (`fetchTarget`'s
 * id-less path, `fetchMultiple`) from overwriting a record a mutation had already moved past.
 */

import { deferredApi, apiResolve } from '../_helpers/fakeApi';
import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

describe('LIFECYCLE · a mutation racing a read of the same scope', () => {
    it('an updateTarget in flight does not cancel a concurrent fetchAll, and only the mutated id is protected from its stale answer', async () => {
        const c = makeComposable<IUser, number>();
        const { call: listCall, control: listControl } = deferredApi<IUser[]>();

        const listPending = c.fetchAll(listCall); // in flight, unrelated to the update below

        await c.updateTarget(
            apiResolve({ ...USERS[0], name: 'Server Won' }),
            { name: 'Optimistic' },
            1
        );

        // the list read's answer finally arrives, carrying a stale copy of the mutated record
        // plus another, untouched one
        listControl.resolve([{ ...USERS[0], name: 'Stale' }, USERS[1]]);
        const items = await listPending;

        // the read was not cancelled: it still resolved with its own answer, not []
        expect(items).toHaveLength(2);
        // the untouched record it carried is stored normally
        expect(c.getRecord(2)).toEqual(USERS[1]);
        // but the mutated record was not overwritten by the read's stale answer
        expect(c.getRecord(1)?.name).toBe('Server Won');
    });

    it("fetchTarget's id-less path does not resurrect a record deleted while it was in flight", async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(USERS[0]), 1); // seed it

        const { call, control } = deferredApi<IUser>();
        const pending = c.fetchTarget(call); // id-less: the id is only known once it resolves

        await c.deleteTarget(apiResolve(), 1);

        control.resolve(USERS[0]); // the late answer identifies the just-deleted record
        await pending;

        expect(c.getRecord(1)).toBeUndefined();
    });

    it('fetchMultiple does not overwrite a record a concurrent updateTarget has already changed', async () => {
        const c = makeComposable<IUser, number>();
        const { call, control } = deferredApi<IUser[]>();

        // neither id is cached yet, so both are "expired" and the call actually runs
        const pending = c.fetchMultiple(call, [1, 2]);

        await c.updateTarget(
            apiResolve({ ...USERS[0], name: 'Server Won' }),
            { name: 'Optimistic' },
            1
        );

        control.resolve([{ ...USERS[0], name: 'Stale' }, USERS[1]]);
        await pending;

        expect(c.getRecord(1)?.name).toBe('Server Won');
        expect(c.getRecord(2)).toEqual(USERS[1]);
    });
});
