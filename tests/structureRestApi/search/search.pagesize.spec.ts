/**
 * SEARCH — pageSize is part of the cache key.
 *   - the same filters+page at different pageSizes are separate buckets
 *   - the same (filters, page, pageSize) is a cache hit
 *   - searchGet must be queried with the matching pageSize
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { buildArticles, type IArticle } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IArticle, number>();
const TECH = buildArticles(5, 'tech', 1);
const SPORT = buildArticles(3, 'sport', 100);
const filters = { category: 'tech' };

describe('SEARCH · pageSize dimension', () => {
    it('different pageSizes are separate buckets', async () => {
        const c = make();
        const size10 = apiResolve(TECH);
        const size20 = apiResolve(TECH);
        await c.fetchSearch(size10, filters, 1, 10);
        await c.fetchSearch(size20, filters, 1, 20);
        expect(size10).toHaveBeenCalledTimes(1);
        expect(size20).toHaveBeenCalledTimes(1);
    });

    it('default pageSize (10) differs from an explicit 20', async () => {
        const c = make();
        const def = apiResolve(TECH);
        const size20 = apiResolve(TECH);
        await c.fetchSearch(def, filters, 1);
        await c.fetchSearch(size20, filters, 1, 20);
        expect(def).toHaveBeenCalledTimes(1);
        expect(size20).toHaveBeenCalledTimes(1);
    });

    it('same (filters, page, pageSize) is a cache hit', async () => {
        const c = make();
        const first = apiResolve(TECH);
        const second = apiResolve(TECH);
        await c.fetchSearch(first, filters, 1, 10);
        await c.fetchSearch(second, filters, 1, 10);
        expect(second).not.toHaveBeenCalled();
    });

    it('searchGet returns the results matching the queried pageSize', async () => {
        const c = make();
        await c.fetchSearch(apiResolve(TECH), filters, 1, 10);
        await c.fetchSearch(apiResolve(SPORT), filters, 1, 20);
        expect(c.searchGet(filters, 1, 10).map((a) => a.id)).toEqual(TECH.map((a) => a.id));
        expect(c.searchGet(filters, 1, 20).map((a) => a.id)).toEqual(SPORT.map((a) => a.id));
    });

    it('searchGet with a mismatched pageSize returns []', async () => {
        const c = make();
        await c.fetchSearch(apiResolve(TECH), filters, 1, 10);
        expect(c.searchGet(filters, 1, 99)).toEqual([]);
    });
});
