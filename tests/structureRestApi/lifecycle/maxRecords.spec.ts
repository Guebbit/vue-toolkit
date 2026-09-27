/**
 * LIFECYCLE — maxRecords: hard upper bound on how many records a resource keeps
 * cached at once (current dependsOn only).
 *
 * A backstop against unbounded growth, not a cache policy. When an incoming batch
 * would push the count past the cap, every other query of this resource's current
 * dependsOn is dropped BEFORE the batch is stored — lists too, not just the records: a
 * list next to a wiped dictionary would list ids that resolve to nothing. The freshest
 * items (the incoming batch) always survive; the crossing query itself is kept (see
 * maxRecords-crossing.spec.ts).
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { buildArticles, type IArticle } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = (maxRecords: number) => makeComposable<IArticle, number>({ maxRecords });

describe('LIFECYCLE · maxRecords', () => {
    it('wipes the store before a batch that would exceed the cap, keeping that batch', async () => {
        const c = make(10);
        // 8 records: under the cap, nothing is wiped
        await c.fetchAll(apiResolve(buildArticles(8, 'tech', 1)), { key: ['a'] });
        expect(c.itemList.value).toHaveLength(8);

        // 5 more would make 13 > 10 → wipe first, then store the 5
        await c.fetchAll(apiResolve(buildArticles(5, 'tech', 100)), { key: ['b'] });
        expect(c.itemList.value).toHaveLength(5);
        // the freshest batch is the one that survived
        expect(c.itemList.value.map((a) => a.id)).toEqual([100, 101, 102, 103, 104]);
    });

    it('never wipes when disabled (maxRecords = 0)', async () => {
        const c = make(0);
        await c.fetchAll(apiResolve(buildArticles(8, 'tech', 1)), { key: ['a'] });
        await c.fetchAll(apiResolve(buildArticles(8, 'tech', 100)), { key: ['b'] });
        expect(c.itemList.value).toHaveLength(16);
    });

    it('the wipe also drops the LIST cache the incoming batch would otherwise (wrongly) accumulate onto', async () => {
        const c = make(10);
        await c.fetchAll(apiResolve(buildArticles(8, 'tech', 1)), { key: ['a'] });
        await c.fetchAll(apiResolve(buildArticles(5, 'tech', 100)), { key: ['b'] });
        // the 'a' list query was removed along with the records — a plain re-fetch under
        // the SAME key must hit the network again, not resolve from an orphaned cache entry
        const refetch = apiResolve(buildArticles(8, 'tech', 1));
        await c.fetchAll(refetch, { key: ['a'] });
        expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('defaults to 10k', () => {
        expect(makeComposable<IArticle, number>().maxRecords).toBe(10_000);
    });
});
