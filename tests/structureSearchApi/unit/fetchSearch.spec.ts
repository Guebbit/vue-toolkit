/**
 * UNIT — fetchSearch: direct contract of the "search with filters" fetch.
 *   - resolves with matching items AND the server-reported totalItems (ISearchResult<T>)
 *   - stores them
 *   - records the page→ids mapping (readable via searchGet)
 *   - handles an empty result set
 *   - re-throws on error without polluting the cache
 *   - a cache hit still reports the right totalItems (it travels with the cached page)
 */

import { makeSearchComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve, apiReject } from '../../structureRestApi/_helpers/fakeApi';
import { buildArticles, type IArticle } from '../../structureRestApi/_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeSearchComposable<IArticle, number>();
const TECH = buildArticles(5, 'tech', 1);

describe('UNIT · fetchSearch', () => {
    it('resolves with the matching items and the reported totalItems', async () => {
        const { searchApi } = make();
        const result = await searchApi.fetchSearch(
            apiResolve({ items: TECH, totalItems: TECH.length }),
            { category: 'tech' }
        );
        expect(result.items).toHaveLength(5);
        expect(result.totalItems).toBe(5);
    });

    it('stores the items in the dictionary', async () => {
        const { searchApi } = make();
        await searchApi.fetchSearch(apiResolve({ items: TECH, totalItems: TECH.length }), {
            category: 'tech'
        });
        expect(searchApi.getRecord(1)).toEqual(TECH[0]);
    });

    it('records the page→ids mapping for searchGet', async () => {
        const { searchApi } = make();
        await searchApi.fetchSearch(
            apiResolve({ items: TECH, totalItems: TECH.length }),
            { category: 'tech' },
            1
        );
        expect(searchApi.searchGet({ category: 'tech' }, 1).map((a) => a.id)).toEqual(
            TECH.map((a) => a.id)
        );
    });

    it('handles an empty result set', async () => {
        const { searchApi } = make();
        await expect(
            searchApi.fetchSearch(apiResolve({ items: [], totalItems: 0 }), { category: 'none' })
        ).resolves.toEqual({ items: [], totalItems: 0 });
    });

    it('re-throws on error and does not cache the failed page', async () => {
        const { searchApi } = make();
        await expect(
            searchApi.fetchSearch(apiReject('server error'), { category: 'tech' }, 1)
        ).rejects.toThrow('server error');
        expect(searchApi.searchGet({ category: 'tech' }, 1)).toEqual([]);
    });

    it('totalItems survives a cache hit, both the resolved promise and the computed', async () => {
        const { searchApi } = make();
        const first = apiResolve({ items: TECH, totalItems: TECH.length });
        const second = apiResolve({ items: TECH, totalItems: TECH.length });
        const firstResult = await searchApi.fetchSearch(first, { category: 'tech' }, 1);
        expect(firstResult.totalItems).toBe(TECH.length);
        expect(searchApi.totalItems.value).toBe(TECH.length);

        const secondResult = await searchApi.fetchSearch(second, { category: 'tech' }, 1);
        expect(second).not.toHaveBeenCalled(); // served from cache
        expect(secondResult.totalItems).toBe(TECH.length); // not 0 — read from the cache entry
        expect(searchApi.totalItems.value).toBe(TECH.length);
    });
});
