/**
 * LIFECYCLE — a `hydrate()` restore (what `persistQueryClient` uses to bring a persisted cache
 * back on boot) must reach the views.
 *
 * `hydrate()` adds a query straight into the cache already holding data: a `Query` built from a
 * dehydrated snapshot never goes through `.setData()`, so only an `added` cache event fires, never
 * `updated`/`success`. The record view (`queryRecordStore`'s dictionary) is a computed keyed off a
 * data counter that only `resourceActivity.ts` bumps on a cache event — if `added` events with data
 * are not counted, the counter never moves, and the computed keeps its stale (usually empty) value
 * until something unrelated changes the same kind.
 */

import { dehydrate, hydrate, QueryClient } from '@tanstack/vue-query';
import { makeComposable, clearAllInstances, newTestClient } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

describe('LIFECYCLE · restoring a persisted cache with hydrate()', () => {
    it('a hydrated record reaches getRecord/itemList without any other cache event', async () => {
        // A source client, seeded and dehydrated — stands in for what persistQueryClient would
        // have written to storage on a previous visit.
        const source = new QueryClient();
        const seeder = makeComposable<IUser, number>({ queryClient: source });
        await seeder.fetchTarget(apiResolve(USERS[0]), 1);
        const snapshot = dehydrate(source);

        // A fresh instance, as if the app had just booted with an empty cache.
        const c = makeComposable<IUser, number>({ queryClient: newTestClient() });
        expect(c.getRecord(1)).toBeUndefined();

        hydrate(c.queryClient, snapshot);

        expect(c.getRecord(1)).toEqual(USERS[0]);
        expect(c.itemList.value).toEqual([USERS[0]]);
    });
});
