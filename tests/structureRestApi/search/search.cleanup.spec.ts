/**
 * SEARCH — searchCleanup keeps memory bounded.
 *   - entries whose backing TanStack query was evicted are pruned (with their total)
 *   - the number of retained (filters, pageSize) buckets stays bounded (MAX_SEARCHES)
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { buildArticles, type IArticle } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IArticle, number>();
const TECH = buildArticles(3, 'tech', 1);
const SPORT = buildArticles(3, 'sport', 100);

describe('SEARCH · cleanup', () => {
    it('prunes an orphaned entry and its total when its query is evicted', async () => {
        const c = make();
        await c.fetchSearch(
            apiResolve([TECH, 42] as [IArticle[], number]),
            { category: 'tech' },
            1,
            10
        );
        expect(c.searchGetTotal({ category: 'tech' }, 10)).toBe(42);

        c.queryClient.clear(); // evict all TanStack entries → tech is now orphaned
        await c.fetchSearch(apiResolve(SPORT), { category: 'sport' }, 1); // triggers cleanup

        expect(c.searchGet({ category: 'tech' }, 1)).toEqual([]);
        expect(c.searchGetTotal({ category: 'tech' }, 10)).toBeUndefined();
        expect(c.searchGet({ category: 'sport' }, 1)).toHaveLength(3);
    });

    it('does not prune a live search cached under a lastUpdateKey', async () => {
        const c = make();
        // this search lives in a namespaced bucket, not the default '' one
        await c.fetchSearch(
            apiResolve([TECH, 42] as [IArticle[], number]),
            { category: 'tech' },
            1,
            10,
            { lastUpdateKey: 'v1' }
        );

        // a second, unrelated search triggers cleanup — the tech search is still live
        await c.fetchSearch(apiResolve(SPORT), { category: 'sport' }, 1);

        expect(c.searchGet({ category: 'tech' }, 1, 10)).toHaveLength(3);
        expect(c.searchGetTotal({ category: 'tech' }, 10)).toBe(42);
    });

    it('keeps the number of retained search buckets bounded (MAX_SEARCHES = 50)', async () => {
        const c = make();
        // 60 distinct searches; cleanup runs on each and caps growth
        for (let i = 0; i < 60; i++) {
            await c.fetchSearch(apiResolve(TECH), { bucket: i }, 1, 10);
        }
        // After pruning-to-50 then adding the current one, at most 51 remain.
        expect(Object.keys(c.searchCached.value).length).toBeLessThanOrEqual(51);
    });
});
