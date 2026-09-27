/**
 * UNIT — watchByParent: fetchByParent's active counterpart. Same shape as watchAll, scoped
 * to a belongsTo parent — updates parentHasMany/getListByParent the same way fetchByParent
 * does, and stays that way without an imperative fetch call.
 */

import { makeComposable, clearAllInstances, flush } from '../_helpers/harness';
import { buildUsers, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IUser, number>();

describe('UNIT · watchByParent', () => {
    it('fires immediately and updates getListByParent', async () => {
        const c = make();
        const apiCall = jest.fn(() => Promise.resolve(buildUsers(2, 1)));
        const { stop } = c.watchByParent(apiCall, 'team-1');

        expect(apiCall).toHaveBeenCalledTimes(1);
        await flush();
        expect(c.getListByParent('team-1').map((u) => u.id)).toEqual([1, 2]);
        stop();
    });

    it('two different parents are tracked independently', async () => {
        const c = make();
        const teamA = jest.fn(() => Promise.resolve(buildUsers(2, 1)));
        const teamB = jest.fn(() => Promise.resolve(buildUsers(2, 10)));

        const a = c.watchByParent(teamA, 'team-a');
        const b = c.watchByParent(teamB, 'team-b');
        await flush();

        expect(c.getListByParent('team-a').map((u) => u.id)).toEqual([1, 2]);
        expect(c.getListByParent('team-b').map((u) => u.id)).toEqual([10, 11]);
        a.stop();
        b.stop();
    });

    it('returns { stop, refetch }; refetch() resolves the current items for that parent', async () => {
        const c = make();
        const apiCall = jest.fn(() => Promise.resolve(buildUsers(1, 1)));
        const { stop, refetch } = c.watchByParent(apiCall, 'team-1');
        await flush();

        const result = await refetch();
        expect(result).toHaveLength(1);
        expect(apiCall).toHaveBeenCalledTimes(2);
        stop();
    });

    it('stop() stops it from reacting to further cache activity', async () => {
        const c = make();
        const apiCall = jest.fn(() => Promise.resolve(buildUsers(1, 1)));
        const { stop } = c.watchByParent(apiCall, 'team-1');
        await flush();
        stop();

        await c.queryClient.invalidateQueries({ queryKey: ['resource'] });
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(1);
    });
});
