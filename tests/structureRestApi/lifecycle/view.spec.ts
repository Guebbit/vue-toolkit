/**
 * LIFECYCLE — the record view is a live, read-only view OF the shared QueryClient, not a
 * second copy kept in sync with it. The most load-bearing claim of the design: reaching the
 * client DIRECTLY — bypassing every method this composable exposes — must still be reflected,
 * because that's what makes cross-store invalidation and a shared cache actually work.
 *
 * Also: records are read-only (Vue's readonly()).
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

describe('LIFECYCLE · the view follows the shared QueryClient directly', () => {
    it('setQueryData called directly on the client appears in itemDictionary/getRecord', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(USERS[0]), 1);
        expect(c.getRecord(2)).toBeUndefined();

        // bypass every method this composable exposes — write straight to the shared client,
        // exactly as another store's `updateTarget` or a manual `setQueryData` call would
        c.queryClient.setQueryData(['resource', 'target', [], '2'], { data: USERS[1] });

        expect(c.getRecord(2)).toEqual(USERS[1]);
        expect(c.itemList.value).toHaveLength(2);
    });

    it('removeQueries called directly on the client empties the affected record', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchAll(apiResolve([...USERS]));
        expect(c.itemList.value).toHaveLength(3);

        c.queryClient.removeQueries({ queryKey: ['resource', 'target', [], '1'], exact: true });

        expect(c.getRecord(1)).toBeUndefined();
        expect(c.itemList.value).toHaveLength(2);
    });

    it('queryClient.clear() called directly empties the whole view', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchAll(apiResolve([...USERS]));
        expect(c.itemList.value).toHaveLength(3);

        c.queryClient.clear();

        expect(c.itemList.value).toHaveLength(0);
        expect(c.getRecord(1)).toBeUndefined();
    });

    it("a SECOND composable instance sharing the client sees the first one's writes", async () => {
        const a = makeComposable<IUser, number>({ resourceKey: 'shared' });
        const b = makeComposable<IUser, number>({
            resourceKey: 'shared',
            queryClient: a.queryClient
        });

        await a.fetchTarget(apiResolve(USERS[0]), 1);

        expect(b.getRecord(1)).toEqual(USERS[0]);
        expect(b.itemList.value).toHaveLength(1);
    });

    it('records are read-only: mutating a returned record in place does not affect the store', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(USERS[0]), 1);
        const record = c.getRecord(1)!;
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

        // Vue's readonly() rejects the write with a dev-mode console.warn, not a thrown
        // exception — either way, the write must not stick.
        (record as IUser).name = 'Mutated';

        expect(warn).toHaveBeenCalled();
        expect(c.getRecord(1)?.name).toBe(USERS[0].name);
        warn.mockRestore();
    });

    it('the dictionary itself is read-only: writing a new key directly is rejected', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(USERS[0]), 1);
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

        (c.itemDictionary.value as Record<number, IUser>)[999] = USERS[1];

        expect(warn).toHaveBeenCalled();
        expect(c.getRecord(999)).toBeUndefined();
        warn.mockRestore();
    });
});
