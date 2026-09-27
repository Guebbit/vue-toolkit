/**
 * MODIFIER — partial: the list just fetched carries only PARTIAL fields, so it must NOT count as
 * the authoritative per-item value.
 *
 * Effects of partial:true, on every list fetch (fetchAll / fetchByParent / fetchPaginate, and
 * useStructureSearchApi's fetchSearch — see tests/structureSearchApi/modifiers/partial.spec.ts):
 *   - each item is MERGED into its record, so the partial payload keeps fields already known;
 *   - the record keeps its EXISTING freshness instead of being stamped "just fetched". A record
 *     new to the cache has none, so it stays stale and a later fetchTarget(id) still asks the
 *     server; a record already fresh stays fresh (an invalidated one stays stale — see
 *     partial-invalidation.spec.ts).
 *
 * Contrasted against the default (no partial) behaviour in each case.
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { USERS, FULL_USER, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

describe('MODIFIER · partial', () => {
    describe('fetchAll seeding', () => {
        it('default: seeds target cache fresh → later fetchTarget is a cache hit', async () => {
            const c = makeComposable<IUser, number>();
            await c.fetchAll(apiResolve([USERS[0]]));
            const get = apiResolve(USERS[0]);
            await c.fetchTarget(get, 1);
            expect(get).not.toHaveBeenCalled();
        });

        it('partial: the record reflects the partial value immediately...', async () => {
            const c = makeComposable<IUser, number>();
            await c.fetchAll(apiResolve([{ id: 1, name: 'Alice' } as IUser]), { partial: true });
            expect(c.getRecord(1)).toEqual({ id: 1, name: 'Alice' });
        });

        it('...but a record new to the cache stays stale, so a later fetchTarget still hits the API', async () => {
            const c = makeComposable<IUser, number>();
            await c.fetchAll(apiResolve([USERS[0]]), { partial: true });
            expect(c.checkTarget(1)).toBe(false);
            const get = apiResolve(USERS[0]);
            await c.fetchTarget(get, 1);
            expect(get).toHaveBeenCalledTimes(1);
        });

        it('...and a record already fresh keeps its freshness (partial never makes it stale)', async () => {
            const c = makeComposable<IUser, number>();
            await c.fetchTarget(apiResolve(FULL_USER), 1);
            await c.fetchAll(apiResolve([{ id: 1, name: 'Alice P' } as IUser]), { partial: true });
            expect(c.checkTarget(1)).toBe(true);
            const get = apiResolve(FULL_USER);
            await c.fetchTarget(get, 1);
            expect(get).not.toHaveBeenCalled();
        });
    });

    describe('fetchByParent merge + seeding', () => {
        it('partial: merges the partial payload, preserving existing fields', async () => {
            const c = makeComposable<IUser, number>();
            await c.fetchTarget(apiResolve(FULL_USER), 1); // full item known
            await c.fetchByParent(apiResolve([{ id: 1, name: 'Alice P' } as IUser]), 'team-1', {
                partial: true
            });
            expect(c.getRecord(1)).toEqual({ ...FULL_USER, name: 'Alice P' });
        });

        it('default: replaces the item with the parent payload (drops fields)', async () => {
            const c = makeComposable<IUser, number>();
            await c.fetchTarget(apiResolve(FULL_USER), 1);
            await c.fetchByParent(apiResolve([{ id: 1, name: 'Alice P' } as IUser]), 'team-1');
            expect(c.getRecord(1)).toEqual({ id: 1, name: 'Alice P' });
        });

        it('partial: a record new to the cache stays stale → later fetchTarget still hits the API', async () => {
            const c = makeComposable<IUser, number>();
            await c.fetchByParent(apiResolve([USERS[0]]), 'team-1', { partial: true });
            expect(c.checkTarget(1)).toBe(false);
            const get = apiResolve(USERS[0]);
            await c.fetchTarget(get, 1);
            expect(get).toHaveBeenCalledTimes(1);
        });

        it('default: seeds target cache fresh → later fetchTarget is a cache hit', async () => {
            const c = makeComposable<IUser, number>();
            await c.fetchByParent(apiResolve([USERS[0]]), 'team-1');
            const get = apiResolve(USERS[0]);
            await c.fetchTarget(get, 1);
            expect(get).not.toHaveBeenCalled();
        });
    });
});
