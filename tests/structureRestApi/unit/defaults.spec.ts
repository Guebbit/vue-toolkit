/**
 * UNIT — empty defaults: every defaulted array parameter and every `?? []` fallback yields an
 * empty result when the argument or cache entry is absent, never a phantom element.
 */

import { createResourceKeys } from '../../../src/internal/resourceKeys';
import { makeComposable, clearAllInstances, flush } from '../_helpers/harness';
import { apiResolve, deferredApi } from '../_helpers/fakeApi';
import { type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IUser, number>();

describe('UNIT · empty defaults', () => {
    it('a list call resolving no items stores nothing and returns no ids', async () => {
        const c = make();
        const items = await c.fetchAll(apiResolve() as never);
        expect(items).toEqual([]);
        expect(Object.keys(c.itemDictionary.value)).toEqual([]);
    });

    it('a read cancelled on a cold cache resolves with an empty list', async () => {
        const c = make();
        const { call } = deferredApi<IUser[]>();
        const pending = c.fetchAll(call);
        await c.queryClient.cancelQueries();
        await expect(pending).resolves.toEqual([]);
    });

    it('checkMultiple() with no arguments splits into two empty lists', () => {
        const c = make();
        expect(c.checkMultiple()).toEqual({ cachedIds: [], expiredIds: [] });
    });

    it('a parent whose list is still loading has no children', async () => {
        const c = make();
        const { call } = deferredApi<IUser[]>();
        void c.fetchByParent(call, 'team-1');
        await flush();
        expect(c.parentHasMany.value['team-1']).toEqual([]);
    });

    it('addToParent on a cold cache links just that child', async () => {
        const c = make();
        c.addToParent('team-1', 5);
        await flush();
        expect(c.parentHasMany.value['team-1']).toEqual([5]);
    });

    it('entry() with only kind and scope adds no extra key segments', () => {
        const keys = createResourceKeys('resource', () => []);
        expect(keys.entry('all', [])).toEqual(['resource', 'all', []]);
    });
});
