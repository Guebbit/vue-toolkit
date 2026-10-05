/**
 * UNIT — invalidateTarget / invalidateLists: targeted stale-marking under the current dependsOn.
 *   - invalidateTarget(id): the record goes stale; a watched one refetches; lists are untouched
 *   - invalidateTarget(alias): reaches the record the alias points at
 *   - invalidateLists(): every list kind goes stale; a watched one refetches; records untouched
 *   - both resolve once the active refetches have
 */

import { makeComposable, clearAllInstances, flush } from '../_helpers/harness';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IUser, number | string>();

describe('UNIT · invalidateTarget', () => {
    it('marks the record stale and leaves lists fresh', async () => {
        const c = make();
        await c.fetchAll(() => Promise.resolve([...USERS]));
        await c.fetchTarget(() => Promise.resolve(USERS[0]), 1);

        await c.invalidateTarget(1);

        expect(c.checkTarget(1)).toBe(false);
        expect(c.checkAll()).toBe(true);
    });

    it('refetches a watched record, and resolves once it has', async () => {
        const c = make();
        const get = jest.fn(() => Promise.resolve(USERS[0]));
        c.watchTarget(get, 1);
        await flush();

        await c.invalidateTarget(1);

        expect(get).toHaveBeenCalledTimes(2);
    });

    it('reaches the record behind an alias', async () => {
        const c = make();
        await c.fetchTarget(() => Promise.resolve(USERS[0]), 'alice');

        await c.invalidateTarget('alice');

        expect(c.checkTarget(1)).toBe(false);
        expect(c.checkTarget('alice')).toBe(false);
    });
});

describe('UNIT · invalidateLists', () => {
    it('marks every list stale and leaves records fresh', async () => {
        const c = make();
        await c.fetchAll(() => Promise.resolve([...USERS]));
        await c.fetchByParent(() => Promise.resolve([USERS[0]]), 10);
        await c.fetchPaginate(() => Promise.resolve([USERS[0]]), 1, 1);

        await c.invalidateLists();

        expect(c.checkAll()).toBe(false);
        expect(c.checkByParent(10)).toBe(false);
        expect(c.checkPaginate(1, 1)).toBe(false);
        expect(c.checkMultiple([1, 2, 3]).expiredIds).toEqual([]);
    });

    it('refetches a watched list, and resolves once it has', async () => {
        const c = make();
        const list = jest.fn(() => Promise.resolve([...USERS]));
        c.watchAll(list);
        await flush();

        await c.invalidateLists();

        expect(list).toHaveBeenCalledTimes(2);
    });
});
