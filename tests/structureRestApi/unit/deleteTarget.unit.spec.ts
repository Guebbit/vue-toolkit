/**
 * UNIT — deleteTarget: direct contract of the optimistic delete.
 *   - removes the item immediately and resolves with the API response
 *   - rolls the item back on error
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve, apiReject } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IUser, number>();

describe('UNIT · deleteTarget', () => {
    it('removes the item immediately and resolves with the API response', async () => {
        const c = make();
        await c.fetchAll(apiResolve([...USERS]));
        const ack = { success: true };
        await expect(c.deleteTarget(apiResolve(ack), 1)).resolves.toEqual(ack);
        expect(c.getRecord(1)).toBeUndefined();
        expect(c.itemList.value).toHaveLength(2);
    });

    it('rolls the item back on error', async () => {
        const c = make();
        await c.fetchAll(apiResolve([...USERS]));
        await expect(c.deleteTarget(apiReject(), 1)).rejects.toThrow();
        expect(c.getRecord(1)).toEqual(USERS[0]);
    });
});
