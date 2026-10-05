/**
 * UNIT — the watcher handle's state, the same on every watch* method:
 *   - `data` follows the watched data as cached now (record, list, any)
 *   - `isPending` is true until the first answer, `isFetching` while a fetch runs
 *   - `dataUpdatedAt` moves when an answer lands
 *   - a watcher with nothing to watch (no id, no parent) stays pending and never fetches
 *   - watchTarget accepts a plain id, not only a Ref or a getter
 */

import { ref } from 'vue';
import { makeComposable, clearAllInstances, flush } from '../_helpers/harness';
import { deferredApi } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IUser, number>();

describe('UNIT · watcher handle state', () => {
    it('watchTarget: pending and fetching until the answer, then data and dataUpdatedAt', async () => {
        const c = make();
        const { call, control } = deferredApi<IUser>();
        const handle = c.watchTarget(() => call(), ref(1));

        expect(handle.isPending.value).toBe(true);
        expect(handle.isFetching.value).toBe(true);
        expect(handle.data.value).toBeUndefined();
        expect(handle.dataUpdatedAt.value).toBe(0);

        control.resolve(USERS[0]);
        await flush();

        expect(handle.isPending.value).toBe(false);
        expect(handle.isFetching.value).toBe(false);
        expect(handle.data.value).toEqual(USERS[0]);
        expect(handle.dataUpdatedAt.value).toBeGreaterThan(0);
    });

    it('watchTarget: data follows the record when it changes locally', async () => {
        const c = make();
        const handle = c.watchTarget(() => Promise.resolve(USERS[0]), 1);
        await flush();

        c.editRecord({ name: 'Edited' }, 1);

        expect(handle.data.value?.name).toBe('Edited');
    });

    it('watchTarget: a plain id is watched like a Ref holding it', async () => {
        const c = make();
        const get = jest.fn((id: number) => Promise.resolve(USERS.find((user) => user.id === id)));
        const handle = c.watchTarget(get, 2);
        await flush();

        expect(get).toHaveBeenCalledWith(2, expect.anything());
        expect(c.selectedIdentifier.value).toBe(2);
        expect(handle.data.value).toEqual(USERS[1]);
    });

    it('watchTarget: with no id it stays pending and never fetches', async () => {
        const c = make();
        const get = jest.fn(() => Promise.resolve(USERS[0]));
        const handle = c.watchTarget(get, ref<number | undefined>());
        await flush();

        expect(get).not.toHaveBeenCalled();
        expect(handle.isPending.value).toBe(true);
        expect(handle.isFetching.value).toBe(false);
        expect(handle.data.value).toBeUndefined();
    });

    it('watchAll: data is the listed records, and follows a local edit', async () => {
        const c = make();
        const handle = c.watchAll(() => Promise.resolve([...USERS]));
        await flush();

        expect(handle.data.value).toEqual(USERS);
        expect(handle.isPending.value).toBe(false);

        c.editRecord({ name: 'Edited' }, 1);

        expect(handle.data.value[0]?.name).toBe('Edited');
    });

    it('watchByParent: data is the parent children; a nullish parent stays pending', async () => {
        const c = make();
        // eslint-disable-next-line unicorn/no-null -- a null parent id is the case under test
        const parentId = ref<number | null>(null);
        const handle = c.watchByParent(() => Promise.resolve([USERS[0], USERS[1]]), parentId);
        await flush();

        expect(handle.isPending.value).toBe(true);
        expect(handle.data.value).toEqual([]);

        parentId.value = 10;
        await flush();

        expect(handle.isPending.value).toBe(false);
        expect(handle.data.value).toEqual([USERS[0], USERS[1]]);
    });

    it('watchAny: data is the answer', async () => {
        const c = make();
        const handle = c.watchAny(() => Promise.resolve({ total: 3 }), { key: ['stats'] });
        await flush();

        expect(handle.data.value).toEqual({ total: 3 });
        expect(handle.isFetching.value).toBe(false);
    });
});
