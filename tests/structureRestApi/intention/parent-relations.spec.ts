/**
 * INTENTION — belongsTo / hasMany relationships.
 * Children fetched per parent are tracked separately, de-duplicated on refetch,
 * and can be unlinked or moved between parents without touching the records
 * themselves.
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { buildUsers, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IUser, number>();

describe('INTENTION · parent relations', () => {
    it('keeps separate child lists per parent', async () => {
        const c = make();
        await c.fetchByParent(apiResolve(buildUsers(3, 1)), 'team-1');
        await c.fetchByParent(apiResolve(buildUsers(2, 10)), 'team-2');
        expect(c.getListByParent('team-1')).toHaveLength(3);
        expect(c.getListByParent('team-2')).toHaveLength(2);
    });

    it('does not duplicate children when the same parent is re-fetched', async () => {
        const c = make();
        await c.fetchByParent(apiResolve(buildUsers(2, 1)), 'team-1');
        await c.fetchByParent(apiResolve(buildUsers(2, 1)), 'team-1', { forced: true });
        expect(c.getListByParent('team-1')).toHaveLength(2);
        expect(c.parentHasMany.value['team-1']).toHaveLength(2);
    });

    it('removeFromParent unlinks a child but keeps the record', async () => {
        const c = make();
        await c.fetchByParent(apiResolve(buildUsers(3, 1)), 'team-1');
        c.removeFromParent('team-1', 1 as never);
        expect(c.getListByParent('team-1')).toHaveLength(2);
        expect(c.getRecord(1)).toBeDefined();
    });

    it('getRecordsByParent returns a dictionary keyed by id', async () => {
        const c = make();
        await c.fetchByParent(apiResolve(buildUsers(2, 1)), 'team-1');
        expect(Object.keys(c.getRecordsByParent('team-1'))).toHaveLength(2);
    });

    it('moves a child from one parent to another', async () => {
        const c = make();
        await c.fetchByParent(apiResolve(buildUsers(2, 1)), 'team-1');
        c.removeFromParent('team-1', 1 as never);
        c.addToParent('team-2', 1 as never);
        expect(c.getListByParent('team-1').map((u) => u.id)).not.toContain(1);
        expect(c.getListByParent('team-2').map((u) => u.id)).toContain(1);
    });

    it('addToParent does not duplicate a child already linked to that parent', async () => {
        const c = make();
        await c.fetchByParent(apiResolve(buildUsers(2, 1)), 'team-1');
        c.addToParent('team-1', 1 as never); // already there
        expect(c.parentHasMany.value['team-1']).toHaveLength(2);
        expect(c.getListByParent('team-1').map((u) => u.id)).toEqual([1, 2]);
    });

    it('the view never repeats a child; removeDuplicateChildren also cleans the stored entry', async () => {
        const c = make();
        await c.fetchByParent(apiResolve(buildUsers(2, 1)), 'team-1'); // seeds ids 1, 2
        c.queryClient.setQueryData(['resource', 'parent', [], 'team-1'], { ids: [1, 1, 2] });
        expect(c.parentHasMany.value['team-1']).toEqual([1, 2]);

        c.removeDuplicateChildren('team-1');
        expect(c.queryClient.getQueryData(['resource', 'parent', [], 'team-1'])).toEqual({
            ids: [1, 2]
        });
        expect(c.getListByParent('team-1').map((u) => u.id)).toEqual([1, 2]);
    });

    it('getRecordsByParent(undefined) is an empty dictionary, not an error', () => {
        const c = make();
        expect(c.getRecordsByParent()).toEqual({});
        expect(c.getListByParent()).toEqual([]);
    });
});

describe('INTENTION · a parent fetched into several buckets', () => {
    it('shows the union of its buckets, and unlinking removes a child from all of them', async () => {
        const c = make();
        await c.fetchByParent(apiResolve(buildUsers(2)), 'team-1', { key: ['widget-a'] });
        await c.fetchByParent(apiResolve(buildUsers(2, 2)), 'team-1', { key: ['widget-b'] });

        expect(c.parentHasMany.value['team-1']).toEqual([1, 2, 3]);

        c.removeFromParent('team-1', 2);

        expect(c.parentHasMany.value['team-1']).toEqual([1, 3]);
    });
});

describe('INTENTION · relation order', () => {
    it('getListByParent keeps the order the server listed the children in', async () => {
        const c = make();
        const [first, second, third] = buildUsers(3);

        await c.fetchByParent(apiResolve([third, first, second]), 'team-1');

        expect(c.getListByParent('team-1').map((user) => user.id)).toEqual([3, 1, 2]);
    });
});
