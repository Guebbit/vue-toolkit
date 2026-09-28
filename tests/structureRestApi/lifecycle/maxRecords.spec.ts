/**
 * LIFECYCLE — maxRecords: hard upper bound on how many records a resource keeps
 * cached at once (current dependsOn only).
 *
 * A backstop against unbounded growth, not a cache policy. When an incoming batch
 * would push the count past the cap, every other query of this resource's current
 * dependsOn is dropped BEFORE the batch is stored — lists too, not just the records: a
 * list next to a wiped dictionary would list ids that resolve to nothing. The freshest
 * items (the incoming batch) always survive; the crossing query itself is kept (see
 * maxRecords-crossing.spec.ts). A record something is actively watching is never dropped
 * (still counts toward the cap, just never evicted) — nor the rows of a watched list, nor the
 * record a watched alias points at — and single-record fetches enforce the bound too, not only
 * list-shaped ones.
 */

import { ref } from 'vue';
import { makeComposable, clearAllInstances, flush } from '../_helpers/harness';
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

    it('does not wipe when a batch lands exactly on the cap, not past it', async () => {
        const c = make(8);
        // 7 already cached, 1 new one incoming — the sum lands exactly on the cap.
        await c.fetchAll(apiResolve(buildArticles(7, 'tech', 1)), { key: ['a'] });
        await c.fetchAll(apiResolve(buildArticles(1, 'tech', 100)), { key: ['b'] });
        // exactly at the cap: nothing is past it, so the first batch survives alongside the second
        expect(c.itemList.value).toHaveLength(8);
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

    it('never empties a record something is actively watching, even past the cap', async () => {
        const c = make(3);
        const watched = c.watchTarget(
            () => Promise.resolve(buildArticles(1, 'tech', 1)[0]),
            ref(1)
        );
        await flush();
        expect(c.getRecord(1)).toBeDefined();

        // a batch that would push well past the cap
        await c.fetchAll(apiResolve(buildArticles(5, 'tech', 10)));

        // the watched record survives, still showing its data, instead of being emptied
        // with nothing telling it to refetch
        expect(c.getRecord(1)).toBeDefined();
        watched.stop();
    });

    it('never empties the rows of a list something is actively watching', async () => {
        const c = make(6);
        const listCall = jest.fn(() => Promise.resolve(buildArticles(5, 'tech', 1)));
        const watched = c.watchAll(listCall);
        await flush();

        // 5 cached + 3 new crosses the cap of 6
        await c.fetchAll(apiResolve(buildArticles(3, 'tech', 100)), { key: ['other'] });

        // the watcher still serves its rows: kept, or fetched again — never ids pointing at nothing
        await expect(watched.suspense()).resolves.toEqual(buildArticles(5, 'tech', 1));
        watched.stop();
    });

    it('never empties a record watched through an alternate key', async () => {
        const c = makeComposable<IArticle, number | string>({ maxRecords: 3 });
        const watched = c.watchTarget(
            () => Promise.resolve(buildArticles(1, 'tech', 7)[0]),
            ref('my-slug')
        );
        await flush();

        await c.fetchAll(apiResolve(buildArticles(3, 'tech', 100)));
        await flush();

        expect(c.selectedRecord.value).toEqual(buildArticles(1, 'tech', 7)[0]);
        watched.stop();
    });

    it('single-record fetchTarget calls enforce the bound too, one id at a time', async () => {
        const c = make(3);
        await c.fetchTarget(apiResolve(buildArticles(1, 'tech', 1)[0]), 1);
        await c.fetchTarget(apiResolve(buildArticles(1, 'tech', 2)[0]), 2);
        await c.fetchTarget(apiResolve(buildArticles(1, 'tech', 3)[0]), 3);

        // a 4th new record crosses the cap: gcTime: Infinity means nothing else would ever
        // evict the earlier ones on its own
        await c.fetchTarget(apiResolve(buildArticles(1, 'tech', 4)[0]), 4);

        expect(c.itemList.value.length).toBeLessThanOrEqual(3);
    });
});
