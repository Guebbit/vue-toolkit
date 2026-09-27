/**
 * INTENTION — regressions from the 5.0 deep scan, one per defect.
 *
 * Ids are one cache entry whatever their JS type; a watcher's fetch uses the id its own query
 * was built from; a cancelled, abandoned or superseded fetch never settles a watcher; an older
 * list answer never undoes a delete; a failed older update never undoes a newer one.
 */

import { ref } from 'vue';
import {
    makeComposable,
    clearAllInstances,
    flush,
    newTestClient,
    runTracked
} from '../_helpers/harness';
import { apiReject, apiResolve, deferred, deferredApi } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';
import { useStructureCrudApi } from '../../../src/composables/structureCrudApi';

afterEach(clearAllInstances);

describe('INTENTION · deep-scan regressions', () => {
    it('a numeric and a string id address the same record', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(USERS[0]), 1);

        c.editRecord({ name: 'Edited' }, '1' as unknown as number);
        await c.deleteTarget(apiResolve({ ok: true }), 1);

        expect(c.itemList.value).toEqual([]);
    });

    it('an id switch plus a same-tick invalidation never stores one record under another', async () => {
        const c = makeComposable<IUser, number>({ staleTime: 0 });
        const id = ref(1);
        c.watchTarget((i) => Promise.resolve({ ...USERS[0], id: i, name: `rec${i}` }), id);
        await flush();

        id.value = 2;
        void c.queryClient.invalidateQueries({ queryKey: ['resource'] });
        await flush();

        expect(c.getRecord(1)?.name).toBe('rec1');
        expect(c.getRecord(2)?.name).toBe('rec2');
    });

    it('a read cancelled by an update does not settle the watcher', async () => {
        const c = makeComposable<IUser, number>({ staleTime: 0 });
        await c.fetchTarget(apiResolve(USERS[0]), 1);
        const read = deferred<IUser>();
        const onSuccess = jest.fn();
        c.watchTarget(() => read.promise, ref(1), { onSuccess });
        await flush();

        await c.updateTarget(apiResolve({ ...USERS[0], name: 'Saved' }), { name: 'Saved' }, 1);
        read.resolve({ ...USERS[0], name: 'Older answer' });
        await flush();

        expect(onSuccess).not.toHaveBeenCalled();
        expect(c.getRecord(1)?.name).toBe('Saved');
    });

    it('an older list answer does not resurrect a deleted record', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchAll(apiResolve([...USERS]));
        const list = deferredApi<IUser[]>();
        const pendingList = c.fetchAll(list.call, { forced: true });

        await c.deleteTarget(apiResolve({ ok: true }), 1);
        list.control.resolve([...USERS]);
        await pendingList;

        expect(c.getRecord(1)).toBeUndefined();
    });

    it('a failed older update does not undo a newer successful one', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(USERS[0]), 1);
        const older = deferredApi<IUser>();
        const pendingOlder = c.updateTarget(older.call, { name: 'Older' }, 1).catch(() => {});
        await flush();

        await c.updateTarget(apiResolve({ ...USERS[0], name: 'Newer' }), { name: 'Newer' }, 1);
        older.control.reject(new Error('409'));
        await pendingOlder;

        expect(c.getRecord(1)?.name).toBe('Newer');
        expect(c.checkTarget(1)).toBe(true);
    });

    it('an update followed synchronously by a scope change writes nothing into the new scope', async () => {
        const user = ref('alice');
        const c = makeComposable<IUser, number>({ dependsOn: () => [user.value] });
        await c.fetchTarget(apiResolve(USERS[0]), 1);

        const pending = c.updateTarget(apiReject(), { name: 'Alice edit' }, 1).catch(() => {});
        user.value = 'bob';
        await pending;
        await flush();

        expect(c.getRecord(1)).toBeUndefined();
    });

    it('a null answer is no record', async () => {
        const c = makeComposable<IUser, number>();

        // eslint-disable-next-line unicorn/no-null -- a null server answer is the case under test
        await c.fetchTarget(() => Promise.resolve(null as unknown as IUser), 1);

        expect(c.itemList.value).toEqual([]);
    });

    it('after resetRecords, a list refetches instead of serving missing records', async () => {
        const c = makeComposable<IUser, number>();
        const list = apiResolve([...USERS]);
        await c.fetchAll(list);

        c.resetRecords();
        const again = await c.fetchAll(list);

        expect(list).toHaveBeenCalledTimes(2);
        expect(again).toEqual(USERS);
    });

    it('a failed older fetchOne does not clear a newer selection', async () => {
        const first = deferred<IProductLike>();
        const crud = runTracked(() =>
            useStructureCrudApi<IProductLike, number>(
                { get: (id) => (id === 1 ? first.promise : Promise.resolve({ id, title: 'two' })) },
                { resourceKey: 'crud', queryClient: newTestClient() }
            )
        );

        const pendingFirst = crud.fetchOne(1).catch(() => {});
        await crud.fetchOne(2);
        first.reject(new Error('404'));
        await pendingFirst;

        expect(crud.selectedIdentifier.value).toBe(2);
    });
});

/** A minimal record for the CRUD case. */
interface IProductLike {
    id: number;
    title: string;
}
