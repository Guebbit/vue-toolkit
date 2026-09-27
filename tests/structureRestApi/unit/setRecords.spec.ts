/**
 * UNIT — setRecords / resetRecords: the direct, non-network record-store escape hatch
 * (bypassing the REST layer's own fetch machinery). resetRecords is deliberately NARROWER
 * than resetAll: it clears only the record store, leaving list-level queries (e.g. fetchAll's
 * own cached id list) untouched.
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IUser, number>();

/** Bracket-assigns onto a typed dictionary — a numeric-keyed object LITERAL trips naming-convention. */
const dictOf = (...items: IUser[]): Record<number, IUser> => {
    const result: Record<number, IUser> = {};
    for (const item of items) result[item.id] = item;
    return result;
};

describe('UNIT · setRecords / resetRecords', () => {
    it('setRecords writes the dictionary directly and returns the items given', () => {
        const c = make();
        const items = dictOf(USERS[0], USERS[1]);
        expect(c.setRecords(items)).toBe(items);
        expect(c.itemList.value).toHaveLength(2);
        expect(c.getRecord(1)).toEqual(USERS[0]);
    });

    it('setRecords replaces the dictionary: ids not in the new set are gone', async () => {
        const c = make();
        await c.fetchAll(apiResolve([...USERS])); // seeds ids 1, 2, 3
        c.setRecords(dictOf({ id: 9, name: 'Zed', email: 'z@x.com' }));
        expect(c.getRecord(1)).toBeUndefined();
        expect(c.itemList.value).toHaveLength(1);
    });

    it('a record written via setRecords is a "local guess", not fresh from the network', async () => {
        const c = make();
        c.setRecords(dictOf(USERS[0]));

        const get = apiResolve(USERS[0]);
        await c.fetchTarget(get, 1);
        expect(get).toHaveBeenCalledTimes(1); // manually-set records are stale, not stamped fresh
    });

    it('the store gets fetched records as fresh, manual addRecord / editRecord as local guesses', async () => {
        const c = make();

        await c.fetchAll(apiResolve([USERS[0]]));
        c.addRecord(USERS[1]);
        c.editRecord(USERS[2], 3);

        expect(c.checkTarget(1)).toBe(true); // fetched: stamped fresh
        expect(c.checkTarget(2)).toBe(false); // manual: a new record stays stale
        expect(c.checkTarget(3)).toBe(false);
    });

    it('resetRecords empties the dictionary', async () => {
        const c = make();
        await c.fetchAll(apiResolve([...USERS]));
        c.resetRecords();
        expect(c.itemList.value).toHaveLength(0);
    });

    it('resetRecords is narrower than resetAll: the list entry survives, but stale', async () => {
        const c = make();
        await c.fetchAll(apiResolve([...USERS]));
        expect(c.checkAll()).toBe(true);

        c.resetRecords();

        expect(c.itemList.value).toHaveLength(0); // records are gone
        expect(c.queryClient.getQueryData(['resource', 'all', []])).toBeDefined(); // the list stays
        expect(c.checkAll()).toBe(false); // but its ids point at nothing: the next read refetches
    });
});
