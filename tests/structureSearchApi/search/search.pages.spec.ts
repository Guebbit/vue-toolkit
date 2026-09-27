/**
 * SEARCH — pages of the same query are cached independently.
 *   - page 1 and page 2 of one query each trigger their own API call
 *   - each page is retrievable via searchGet
 *   - re-requesting a cached page while fresh is a cache hit
 *   - navigating forward then back to a cached page does not refetch
 */

import { makeSearchComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../../structureRestApi/_helpers/fakeApi';
import { buildArticles, type IArticle } from '../../structureRestApi/_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeSearchComposable<IArticle, number>();
const PAGE1 = buildArticles(5, 'tech', 1);
const PAGE2 = buildArticles(5, 'tech', 6);
const PAGE3 = buildArticles(2, 'tech', 11);
const filters = { category: 'tech' };
// The server-reported total across ALL pages of this query — travels with each page's entry.
const TOTAL = PAGE1.length + PAGE2.length + PAGE3.length;

describe('SEARCH · pages', () => {
    it('different pages of the same query each call the API', async () => {
        const { searchApi } = make();
        const p1 = apiResolve({ items: PAGE1, totalItems: TOTAL });
        const p2 = apiResolve({ items: PAGE2, totalItems: TOTAL });
        await searchApi.fetchSearch(p1, filters, 1);
        await searchApi.fetchSearch(p2, filters, 2);
        expect(p1).toHaveBeenCalledTimes(1);
        expect(p2).toHaveBeenCalledTimes(1);
    });

    it('each page is retrievable via searchGet', async () => {
        const { searchApi } = make();
        await searchApi.fetchSearch(apiResolve({ items: PAGE1, totalItems: TOTAL }), filters, 1);
        await searchApi.fetchSearch(apiResolve({ items: PAGE2, totalItems: TOTAL }), filters, 2);
        await searchApi.fetchSearch(apiResolve({ items: PAGE3, totalItems: TOTAL }), filters, 3);
        expect(searchApi.searchGet(filters, 1).map((a) => a.id)).toEqual(PAGE1.map((a) => a.id));
        expect(searchApi.searchGet(filters, 2).map((a) => a.id)).toEqual(PAGE2.map((a) => a.id));
        expect(searchApi.searchGet(filters, 3).map((a) => a.id)).toEqual(PAGE3.map((a) => a.id));
    });

    it('re-requesting a cached page while fresh is a cache hit', async () => {
        const { searchApi } = make();
        await searchApi.fetchSearch(apiResolve({ items: PAGE1, totalItems: TOTAL }), filters, 1);
        const again = apiResolve({ items: PAGE1, totalItems: TOTAL });
        await searchApi.fetchSearch(again, filters, 1);
        expect(again).not.toHaveBeenCalled();
    });

    it('navigating forward then back to page 1 does not refetch page 1', async () => {
        const { searchApi } = make();
        const p1 = apiResolve({ items: PAGE1, totalItems: TOTAL });
        await searchApi.fetchSearch(p1, filters, 1);
        await searchApi.fetchSearch(apiResolve({ items: PAGE2, totalItems: TOTAL }), filters, 2);
        const p1Again = apiResolve({ items: PAGE1, totalItems: TOTAL });
        await searchApi.fetchSearch(p1Again, filters, 1);
        expect(p1).toHaveBeenCalledTimes(1);
        expect(p1Again).not.toHaveBeenCalled();
    });

    it('all pages accumulate in the dictionary', async () => {
        const { searchApi } = make();
        await searchApi.fetchSearch(apiResolve({ items: PAGE1, totalItems: TOTAL }), filters, 1);
        await searchApi.fetchSearch(apiResolve({ items: PAGE2, totalItems: TOTAL }), filters, 2);
        await searchApi.fetchSearch(apiResolve({ items: PAGE3, totalItems: TOTAL }), filters, 3);
        expect(searchApi.itemList.value).toHaveLength(12);
    });

    it('pageTotal is ceil(totalItems / pageSize), derived from the server-reported total', async () => {
        const { searchApi } = make();
        // totalItems/pageTotal read the shared pageSize REF (not fetchSearch's own pageSize arg)
        // to look up the applied search's cache entry — keep them aligned.
        searchApi.pageSize.value = 5;
        await searchApi.fetchSearch(apiResolve({ items: PAGE1, totalItems: TOTAL }), filters, 1, 5);
        expect(searchApi.totalItems.value).toBe(TOTAL);
        expect(searchApi.pageTotal.value).toBe(Math.ceil(TOTAL / 5));
    });
});
