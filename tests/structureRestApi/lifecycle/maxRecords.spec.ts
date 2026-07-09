/**
 * LIFECYCLE — maxRecords: hard upper bound on itemDictionary size.
 *
 * A backstop against unbounded growth, not a cache policy. When an incoming batch
 * would push the dictionary past the cap, the whole client store is wiped BEFORE the
 * batch is stored — so the freshest items always survive, and no structure is left
 * holding ids that no longer resolve.
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
        await c.fetchAll(apiResolve(buildArticles(8, 'tech', 1)), { lastUpdateKey: 'a' });
        expect(c.itemList.value).toHaveLength(8);

        // 5 more would make 13 > 10 → wipe first, then store the 5
        await c.fetchAll(apiResolve(buildArticles(5, 'tech', 100)), { lastUpdateKey: 'b' });
        expect(c.itemList.value).toHaveLength(5);
        // the freshest batch is the one that survived
        expect(c.itemList.value.map((a) => a.id)).toEqual([100, 101, 102, 103, 104]);
    });

    it('leaves no dangling ids behind: searches are reset with the records', async () => {
        const c = make(10);
        await c.fetchSearch(apiResolve([buildArticles(8, 'tech', 1), 8]), { category: 'tech' }, 1);
        expect(c.searchGet({ category: 'tech' }, 1)).toHaveLength(8);

        // trip the cap via an unrelated fetch
        await c.fetchAll(apiResolve(buildArticles(5, 'sport', 100)));

        // searchCached must be gone too — NOT a short array of survivors
        expect(c.searchGet({ category: 'tech' }, 1)).toEqual([]);
        expect(c.searchGetTotal({ category: 'tech' }, 10)).toBeUndefined();
    });

    it('never wipes when disabled (maxRecords = 0)', async () => {
        const c = make(0);
        await c.fetchAll(apiResolve(buildArticles(8, 'tech', 1)), { lastUpdateKey: 'a' });
        await c.fetchAll(apiResolve(buildArticles(8, 'tech', 100)), { lastUpdateKey: 'b' });
        expect(c.itemList.value).toHaveLength(16);
    });

    it('defaults to 100k', () => {
        expect(makeComposable<IArticle, number>().maxRecords).toBe(100_000);
    });
});
