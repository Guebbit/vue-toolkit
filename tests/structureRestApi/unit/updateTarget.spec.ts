/**
 * UNIT — updateTarget: direct contract of the optimistic update.
 *   - applies the change and (by default) confirms it with the server response
 *   - resolves with the raw API response
 *   - rolls back to the previous record on error, INCLUDING fields it added
 *   - cancels an in-flight read of the same record before applying the edit
 *
 * (merge lives in modifiers/merge.spec.ts; the full CRUD round-trip in
 * intention/crud-lifecycle.spec.ts.)
 */

import { makeComposable, clearAllInstances, flush } from '../_helpers/harness';
import { apiResolve, apiReject, deferredApi } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';
import { useFakeClock, advance, restoreClock } from '../_helpers/time';

afterEach(clearAllInstances);

const make = () => makeComposable<IUser, number>();

async function seedAlice(c: ReturnType<typeof make>) {
    await c.fetchAll(apiResolve([...USERS]));
}

describe('UNIT · updateTarget', () => {
    it('applies the update and confirms it', async () => {
        const c = make();
        await seedAlice(c);
        const updated: IUser = { id: 1, name: 'Alice Updated', email: 'new@example.com' };
        await c.updateTarget(apiResolve(updated), { name: 'Alice Updated' }, 1);
        expect(c.getRecord(1)?.name).toBe('Alice Updated');
    });

    it('resolves with the raw API response', async () => {
        const c = make();
        await seedAlice(c);
        const response: IUser = { id: 1, name: 'Alice Server', email: 'alice@example.com' };
        await expect(c.updateTarget(apiResolve(response), { name: 'x' }, 1)).resolves.toEqual(
            response
        );
    });

    it('rolls back to the previous record on error', async () => {
        const c = make();
        await seedAlice(c);
        await expect(c.updateTarget(apiReject(), { name: 'Broken' }, 1)).rejects.toThrow();
        expect(c.getRecord(1)).toEqual(USERS[0]);
    });

    it('rolls back fields the optimistic update ADDED, not just the ones it changed', async () => {
        const c = make();
        const original: IUser = { id: 1, name: 'Alice', email: 'a@x.com' };
        await c.fetchTarget(apiResolve(original), 1);

        // optimistic patch introduces a NEW field, then the server rejects
        await expect(
            c.updateTarget(apiReject(), { draft: true } as unknown as Partial<IUser>, 1)
        ).rejects.toThrow();

        // a merge-based rollback would leave `draft` behind: the restore must be a
        // full replace of the snapshot, not a merge over the mutated record
        expect(c.getRecord(1)).not.toHaveProperty('draft');
        expect(c.getRecord(1)).toEqual(original);
    });

    it('a late update response does not resurrect a record a concurrent delete already removed', async () => {
        const c = make();
        await seedAlice(c);

        const { call: updateCall, control: updateControl } = deferredApi<IUser>();
        const updatePromise = c.updateTarget(updateCall, { name: 'Late Update' }, 1);

        await c.deleteTarget(apiResolve({ id: 1 }), 1);
        expect(c.getRecord(1)).toBeUndefined();

        updateControl.resolve({ id: 1, name: 'Late Update', email: 'alice@example.com' });
        await updatePromise;

        expect(c.getRecord(1)).toBeUndefined();
    });

    it('cancels an in-flight fetchTarget of the same id: the read settles, the edit shows', async () => {
        const c = make();
        await c.fetchTarget(apiResolve(USERS[0]), 1);
        const read = deferredApi<IUser>();
        const pendingRead = c.fetchTarget(read.call, 1, { forced: true });
        const save = deferredApi<IUser>();

        const pendingUpdate = c.updateTarget(save.call, { name: 'Edited' }, 1);
        await flush();

        // cancelled: the record's query stopped fetching, and the read resolves
        // (with what is cached) instead of rejecting
        expect(c.queryClient.getQueryState(['resource', 'target', [], '1'])?.fetchStatus).toBe(
            'idle'
        );
        await expect(pendingRead).resolves.toBeDefined();
        expect(c.getRecord(1)?.name).toBe('Edited');

        save.control.resolve({ ...USERS[0], name: 'Edited' });
        await pendingUpdate;
    });

    // The cancelled read's query function sees the cancellation (its abort signal) and stores
    // nothing: an older answer arriving mid-save must not overwrite the optimistic edit.
    it("the cancelled read's late answer does not overwrite the optimistic edit", async () => {
        const c = make();
        await c.fetchTarget(apiResolve(USERS[0]), 1);
        const read = deferredApi<IUser>();
        const pendingRead = c.fetchTarget(read.call, 1, { forced: true });
        const save = deferredApi<IUser>();
        const pendingUpdate = c.updateTarget(save.call, { name: 'Edited' }, 1);
        await flush();

        read.control.resolve({ ...USERS[0], name: 'Older answer' });
        await pendingRead;
        await flush();
        const shownWhileSaving = c.getRecord(1)?.name;

        save.control.resolve({ ...USERS[0], name: 'Edited' });
        await pendingUpdate;

        expect(shownWhileSaving).toBe('Edited');
    });

    // A "local guess" (optimistic edit, rollback) KEEPS the record's existing freshness rather
    // than advancing it — it neither manufactures freshness nor manufactures staleness. So the
    // only unambiguous way to observe that is to start from a record that's already EXPIRED:
    // if the optimistic edit (or its rollback) accidentally stamped it fresh, the check below
    // would wrongly serve from cache instead of asking the server again.
    describe('freshness of what an update writes', () => {
        const STALE_TIME = 10_000;

        beforeEach(() => useFakeClock());
        afterEach(() => restoreClock());

        it('a rollback keeps the record exactly as stale as it was before the update attempt', async () => {
            const c = makeComposable<IUser, number>({ staleTime: STALE_TIME });
            await c.fetchTarget(apiResolve(USERS[0]), 1);
            await advance(STALE_TIME + 1); // now genuinely expired, BEFORE updateTarget even starts

            await expect(c.updateTarget(apiReject(), { name: 'Broken' }, 1)).rejects.toThrow();

            const get = apiResolve(USERS[0]);
            await c.fetchTarget(get, 1);
            expect(get).toHaveBeenCalledTimes(1); // still expired — rollback didn't sneak in a fresh stamp
        });

        it("applyResponse's write IS fresh, regardless of how stale the record was going in", async () => {
            const c = makeComposable<IUser, number>({ staleTime: STALE_TIME });
            await c.fetchTarget(apiResolve(USERS[0]), 1);
            await advance(STALE_TIME + 1); // expired before the update starts

            const response: IUser = { id: 1, name: 'Alice Server', email: 'alice@example.com' };
            await c.updateTarget(apiResolve(response), { name: 'x' }, 1);

            const get = apiResolve(response);
            await c.fetchTarget(get, 1);
            expect(get).not.toHaveBeenCalled(); // the server's own response counts as freshly fetched
        });

        it('applyResponse: false leaves the record exactly as stale as it was, without applying the response', async () => {
            const c = makeComposable<IUser, number>({ staleTime: STALE_TIME });
            await c.fetchTarget(apiResolve(USERS[0]), 1);
            await advance(STALE_TIME + 1); // expired before the update starts

            const response = { acknowledged: true };
            await c.updateTarget(apiResolve(response), { name: 'Optimistic' }, 1, {
                applyResponse: false
            });

            expect(c.getRecord(1)?.name).toBe('Optimistic'); // response never overwrote it

            const get = apiResolve(USERS[0]);
            await c.fetchTarget(get, 1);
            expect(get).toHaveBeenCalledTimes(1); // still expired — applyResponse:false never stamped it fresh
        });
    });
});

describe('UNIT · updateTarget mutation key', () => {
    // V2.10: a numeric id must produce the same string form a query key uses (resourceKeys.ts's
    // target()), so a filter matching one by id matches the other — what V5.3's isSaving(id) needs.
    it('stringifies a numeric id, like query keys do', async () => {
        const c = makeComposable<IUser, number>();
        const { call, control } = deferredApi<IUser>();
        const pending = c.updateTarget(call, { name: 'Edited' }, 1);
        await flush();

        const mutation = c.queryClient
            .getMutationCache()
            .getAll()
            .find((m) => m.options.mutationKey?.[1] === 'update');
        expect(mutation?.options.mutationKey).toEqual(['resource', 'update', '1']);

        control.resolve({ ...USERS[0], name: 'Edited' });
        await pending;
    });
});

describe('UNIT · updateTarget with an empty response', () => {
    it('keeps the optimistic patch instead of failing after the server succeeded', async () => {
        const c = make();
        await c.fetchTarget(apiResolve(USERS[0]), 1);

        await expect(
            c.updateTarget(() => Promise.resolve(), { name: 'Edited' }, 1)
        ).resolves.toBeUndefined();

        expect(c.getRecord(1)).toEqual({ ...USERS[0], name: 'Edited' });
    });
});
