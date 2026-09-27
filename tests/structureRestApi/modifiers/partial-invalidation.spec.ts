/**
 * MODIFIER — a local guess keeps a record's freshness, invalidation included.
 *
 * TanStack's setQueryData clears a query's "invalidated" flag. A partial list write, an
 * optimistic edit or a manual write is a guess, not fresh data: after one, an invalidated
 * record must still read as stale, so the next fetchTarget asks the server.
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { FULL_USER, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

describe('MODIFIER · local writes keep an invalidation', () => {
    it('a partial list write does not make an invalidated record fresh', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(FULL_USER), 1);
        await c.queryClient.invalidateQueries({ queryKey: ['resource', 'target'] });
        expect(c.checkTarget(1)).toBe(false);

        await c.fetchAll(apiResolve([{ id: 1, name: 'Alice P' } as IUser]), { partial: true });

        expect(c.checkTarget(1)).toBe(false);
        expect(c.getRecord(1)).toEqual({ ...FULL_USER, name: 'Alice P' });
    });

    it('a manual edit does not make an invalidated record fresh', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(FULL_USER), 1);
        await c.queryClient.invalidateQueries({ queryKey: ['resource', 'target'] });

        c.editRecord({ name: 'Edited' }, 1);

        expect(c.checkTarget(1)).toBe(false);
    });

    it('a full fetch does make it fresh again', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(FULL_USER), 1);
        await c.queryClient.invalidateQueries({ queryKey: ['resource', 'target'] });

        await c.fetchTarget(apiResolve(FULL_USER), 1);

        expect(c.checkTarget(1)).toBe(true);
    });
});
