/**
 * UNIT — watchByParent: fetchByParent's active counterpart. Same shape as watchAll, scoped
 * to a belongsTo parent — updates parentHasMany/getListByParent the same way fetchByParent
 * does, and stays that way without an imperative fetch call.
 *   - a nullish parent id idles instead of calling apiCall(undefined), refetch() included
 *   - accepts enabled and a reactive key
 */

import { ref } from 'vue';
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

    // a nullish parent id must idle, never call apiCall(undefined).
    it('a nullish parent id idles: no fetch, no call, until it becomes a real id', async () => {
        const c = make();
        const parentId = ref<string | undefined>(undefined);
        const apiCall = jest.fn(() => Promise.resolve(buildUsers(1, 1)));
        const { stop } = c.watchByParent(apiCall, parentId);
        await flush();

        expect(apiCall).not.toHaveBeenCalled();

        parentId.value = 'team-1';
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(1);
        expect(c.getListByParent('team-1').map((u) => u.id)).toEqual([1]);
        stop();
    });

    // TanStack's refetch() runs the query even while `enabled` is false; with no parent id there
    // is nothing to ask for, so watchByParent's refetch() must not reach apiCall at all.
    it('refetch() while the parent id is nullish resolves [] without calling apiCall', async () => {
        const c = make();
        const apiCall = jest.fn(() => Promise.resolve(buildUsers(1, 1)));
        const { refetch } = c.watchByParent(apiCall, ref<string | undefined>(undefined));
        await flush();

        const result = await refetch();

        expect(apiCall).not.toHaveBeenCalled();
        expect(result).toEqual([]);
    });

    it('accepts enabled: false, and starts fetching once it flips true', async () => {
        const c = make();
        const enabled = ref(false);
        const apiCall = jest.fn(() => Promise.resolve(buildUsers(1, 1)));
        const { stop } = c.watchByParent(apiCall, 'team-1', { enabled });
        await flush();

        expect(apiCall).not.toHaveBeenCalled();

        enabled.value = true;
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(1);
        stop();
    });

    it('accepts a reactive key, and re-runs when it changes', async () => {
        const c = make();
        const key = ref(['widget-a']);
        const apiCall = jest.fn(() => Promise.resolve(buildUsers(1, 1)));
        const { stop } = c.watchByParent(apiCall, 'team-1', { key });
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(1);

        key.value = ['widget-b'];
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(2);
        stop();
    });
});
