/**
 * LIFECYCLE — a mutation on one record must not disturb a read of the rest of the scope, and a
 * read that started before a mutation must not overwrite what the mutation leaves behind once it
 * lands late.
 *
 * `updateTarget`/`deleteTarget` cancel only the record's own in-flight read, never the whole
 * scope's list reads — an unrelated in-flight `fetchAll` still resolves normally and stores every
 * id it carries except the one being mutated. Whether a late answer for the mutated id may still
 * write is asked of TanStack's own `MutationCache` (`src/internal/recordMutations.ts`'s
 * `canWrite`) — the exact question `isSaving` asks — instead of a private, per-instance write
 * guard: one cache per `QueryClient` means every instance sees every mutation, and ids are always
 * compared as strings.
 *
 * The same guarantee holds for a by-id read of the record itself started after the mutation began
 * (nothing cancels it: only `canWrite` stops it), for a string and a number spelling of one id,
 * and across two instances of one resource sharing a client.
 *
 * The last describe block below covers a different race: two mutations on the SAME id, started in
 * the same tick. Before `resourceMutations.ts`'s snapshot moved to apply time, both captured
 * "before either ran" as their rollback target, so a same-tick sibling's failure could undo a
 * confirmed success and land the record back on data from before either call started.
 */

import { ref } from 'vue';
import type { QueryClient } from '@tanstack/vue-query';
import { deferredApi, apiResolve, apiReject } from '../_helpers/fakeApi';
import { makeComposable, makeShared, clearAllInstances, flush } from '../_helpers/harness';
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

    it("a string id and a number id guard the same record: updateTarget(…, '1') keeps a list read's stale copy of record 1 out", async () => {
        const c = makeComposable<IUser, number | string>();
        const list = deferredApi<IUser[]>();
        const listPending = c.fetchAll(list.call);

        // a route param: the id arrives as a string, the server's records carry a number
        await c.updateTarget(
            apiResolve({ ...USERS[0], name: 'Server Won' }),
            { name: 'Optimistic' },
            '1'
        );

        list.control.resolve([{ ...USERS[0], name: 'Stale' }, USERS[1]]);
        await listPending;

        expect(c.getRecord(1)?.name).toBe('Server Won');
    });
});

describe('LIFECYCLE · a by-id read of the record a mutation is changing', () => {
    it('a fetchTarget started while an updateTarget is in flight shows the edit, then the update response', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(USERS[0]), 1);
        const save = deferredApi<IUser>();
        const pendingUpdate = c.updateTarget(save.call, { name: 'Optimistic' }, 1);
        await flush(); // the edit is applied

        // started after the update began: nothing cancels it, only the write guard stops it
        await c.fetchTarget(apiResolve({ ...USERS[0], name: 'Stale' }), 1, { forced: true });
        expect(c.getRecord(1)?.name).toBe('Optimistic');

        save.control.resolve({ ...USERS[0], name: 'Server Won' });
        await pendingUpdate;
        expect(c.getRecord(1)?.name).toBe('Server Won');
    });

    it('a watchTarget refetch while an updateTarget is in flight shows the edit, then the update response', async () => {
        const c = makeComposable<IUser, number>();
        const answers = [USERS[0], { ...USERS[0], name: 'Stale' }];
        const get = jest.fn(() =>
            Promise.resolve(answers.shift() ?? { ...USERS[0], name: 'Server Won' })
        );
        const handle = c.watchTarget(get, ref(1));
        await flush();
        const save = deferredApi<IUser>();
        const pendingUpdate = c.updateTarget(save.call, { name: 'Optimistic' }, 1);
        await flush();

        await handle.refetch(); // answers with the copy from before the update
        expect(c.getRecord(1)?.name).toBe('Optimistic');

        save.control.resolve({ ...USERS[0], name: 'Server Won' });
        await pendingUpdate;
        await flush();
        expect(c.getRecord(1)?.name).toBe('Server Won');
    });

    it('a fetchTarget landing while a deleteTarget is in flight does not bring the record back', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(USERS[0]), 1);
        const remove = deferredApi<{ ok: boolean }>();
        const pendingDelete = c.deleteTarget(remove.call, 1);
        await flush(); // the record is removed locally

        // started after the delete began: nothing cancels it, only the write guard stops it
        await c.fetchTarget(apiResolve({ ...USERS[0], name: 'Stale' }), 1);

        remove.control.resolve({ ok: true });
        await pendingDelete;

        expect(c.getRecord(1)).toBeUndefined();
    });
});

describe('LIFECYCLE · two instances of one resource on one client', () => {
    it("a mutation in one instance keeps the other instance's list read from overwriting the record", async () => {
        const { a, b } = makeShared<IUser, number>();
        const list = deferredApi<IUser[]>();
        const listPending = b.fetchAll(list.call);

        await a.updateTarget(
            apiResolve({ ...USERS[0], name: 'Server Won' }),
            { name: 'Optimistic' },
            1
        );

        list.control.resolve([{ ...USERS[0], name: 'Stale' }, USERS[1]]);
        await listPending;

        // one cache: both instances show the same record
        expect(a.getRecord(1)?.name).toBe('Server Won');
    });
});

describe('LIFECYCLE · two same-tick mutations on the same id', () => {
    it("a sibling's rollback returns to what THIS call applied, not to before either ran, and the record is invalidated", async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(USERS[0]), 1); // seed: 'Alice'

        const a = deferredApi<IUser>();
        const b = deferredApi<IUser>();

        // both start in the same tick, before either's leading cancelReads() has resolved
        const pendingA = c.updateTarget(a.call, { name: 'A' }, 1);
        const pendingB = c.updateTarget(b.call, { name: 'B' }, 1);

        // A succeeds, but B has since applied its own edit on top: A's confirmed answer is
        // discarded rather than resurrected over B's newer, still-optimistic value
        a.control.resolve({ ...USERS[0], name: 'A confirmed' });
        await pendingA;
        expect(c.getRecord(1)?.name).toBe('B');

        // B then fails: its rollback must land on A's OWN optimistic value (what the record held
        // right before B applied its change), never on the pre-A 'Alice' both calls started from
        b.control.reject(new Error('fail'));
        await expect(pendingB).rejects.toThrow();
        expect(c.getRecord(1)?.name).toBe('A');

        // neither call's guess is server-confirmed any more: the next read must reconcile
        expect(c.checkTarget(1)).toBe(false);
    });
});

/**
 * Spies on the client's `invalidateQueries` and reports what asked for a record reconcile
 * (`refetchType: 'active'`) versus the list invalidations (no `refetchType`).
 *
 * @param c - the composable whose client is watched
 * @returns counters over the calls made since the spy was installed
 */
const watchInvalidations = (c: { queryClient: QueryClient }) => {
    const spy = jest.spyOn(c.queryClient, 'invalidateQueries');
    const filters = () => spy.mock.calls.map(([filter]) => filter);
    return {
        spy,
        records: () => filters().filter((filter) => filter?.refetchType === 'active').length,
        lists: () => filters().filter((filter) => filter?.refetchType === undefined).length
    };
};

describe('LIFECYCLE · a newer mutation on the same id wins', () => {
    it("an older update's success is not applied and the record is invalidated instead", async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(USERS[0]), 1);
        const a = deferredApi<IUser>();
        const b = deferredApi<IUser>();
        const invalidations = watchInvalidations(c);

        const pendingA = c.updateTarget(a.call, { name: 'A' }, 1);
        const pendingB = c.updateTarget(b.call, { name: 'B' }, 1);
        await flush();

        a.control.resolve({ ...USERS[0], name: 'A confirmed' });
        await pendingA;

        expect(c.getRecord(1)?.name).toBe('B');
        expect(invalidations.records()).toBe(1);
        expect(invalidations.lists()).toBe(1);

        b.control.resolve({ ...USERS[0], name: 'B confirmed' });
        await pendingB;
        expect(c.getRecord(1)?.name).toBe('B confirmed');
    });

    it("an older update's failure skips the rollback and does not invalidate the record", async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(USERS[0]), 1);
        const a = deferredApi<IUser>();
        const b = deferredApi<IUser>();
        const invalidations = watchInvalidations(c);

        const pendingA = c.updateTarget(a.call, { name: 'A' }, 1);
        const pendingB = c.updateTarget(b.call, { name: 'B' }, 1);
        await flush();

        a.control.reject(new Error('fail'));
        await expect(pendingA).rejects.toThrow('fail');

        // B owns the record: neither restored to the pre-A snapshot nor marked for reconcile
        expect(c.getRecord(1)?.name).toBe('B');
        expect(invalidations.records()).toBe(0);
        // the lists still learn that a mutation settled
        expect(invalidations.lists()).toBe(1);

        b.control.resolve({ ...USERS[0], name: 'B confirmed' });
        await pendingB;
    });

    it('an update failing alone restores the pre-update snapshot and invalidates the record', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(USERS[0]), 1);
        const invalidations = watchInvalidations(c);

        await expect(c.updateTarget(apiReject(), { name: 'A' }, 1)).rejects.toThrow();

        expect(c.getRecord(1)).toEqual(USERS[0]);
        expect(invalidations.records()).toBe(1);
        expect(invalidations.lists()).toBe(1);
        expect(c.checkTarget(1)).toBe(false);
    });

    it('an update failing alone on an id it created optimistically removes the record again', async () => {
        const c = makeComposable<IUser, number>();

        await expect(c.updateTarget(apiReject(), USERS[1], 2)).rejects.toThrow();

        expect(c.getRecord(2)).toBeUndefined();
    });

    it('a settled mutation invalidates the record with refetchType "active" (inactive readers are not refetched)', async () => {
        const c = makeComposable<IUser, number>();
        const seed = apiResolve(USERS[0]);
        await c.fetchTarget(seed, 1);
        const invalidations = watchInvalidations(c);

        await expect(c.deleteTarget(apiReject(), 1)).rejects.toThrow();
        await flush();

        expect(invalidations.spy).toHaveBeenCalledWith(
            expect.objectContaining({ refetchType: 'active' })
        );
        // nothing watches record 1: only active readers refetch, so the seed call is not repeated
        expect(seed).toHaveBeenCalledTimes(1);
    });
});

describe('LIFECYCLE · mutation keys', () => {
    it('mutateAny and createTarget register under [resourceKey, "any"] / [resourceKey, "create"]', async () => {
        const c = makeComposable<IUser, number>({ resourceKey: 'people' });
        const any = deferredApi<string>();
        const create = deferredApi<IUser>();
        const keysInFlight = () =>
            c.queryClient
                .getMutationCache()
                .getAll()
                .filter((mutation) => mutation.state.status === 'pending')
                .map((mutation) => mutation.options.mutationKey);

        const pendingAny = c.mutateAny(any.call);
        expect(keysInFlight()).toEqual([['people', 'any']]);
        any.control.resolve('done');
        await pendingAny;

        const pendingCreate = c.createTarget(create.call);
        expect(keysInFlight()).toEqual([['people', 'create']]);
        create.control.resolve(USERS[0]);
        await pendingCreate;
    });
});
