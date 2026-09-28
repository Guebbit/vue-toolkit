/**
 * UNIT — fetchSearch: direct contract of the "search with filters" fetch.
 *   - resolves with matching items AND the server-reported totalItems (ISearchResult<T>)
 *   - stores them
 *   - records the page→ids mapping (readable via searchGet)
 *   - handles an empty result set
 *   - re-throws on error without polluting the cache
 *   - a cache hit still reports the right totalItems (it travels with the cached page)
 *   - applies page/pageSize itself, so pageItemList shows what it just fetched (V2.6)
 *   - applies the page together with the filters and size: no request, and no frame, for a page
 *     other than the one it was given
 */

import { watch } from 'vue';
import { makeSearchComposable, clearAllInstances, flush } from '../_helpers/harness';
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

    it('applies page/pageSize, so pageItemList shows the page it just fetched', async () => {
        const { searchApi } = make();
        const PAGE1 = buildArticles(5, 'tech', 1);
        const PAGE2 = buildArticles(5, 'tech', 100);

        await searchApi.fetchSearch(
            apiResolve({ items: PAGE1, totalItems: 10 }),
            { category: 'tech' },
            1,
            5
        );
        expect(searchApi.pageItemList.value).toEqual(PAGE1);

        // fetching page 2 must not leave pageItemList still showing page 1
        await searchApi.fetchSearch(
            apiResolve({ items: PAGE2, totalItems: 10 }),
            { category: 'tech' },
            2,
            5
        );

        expect(searchApi.pageCurrent.value).toBe(2);
        expect(searchApi.pageSize.value).toBe(5);
        expect(searchApi.pageItemList.value).toEqual(PAGE2);
    });
});

/**
 * A search server over 30 matches that logs every page asked of it.
 *
 * @returns the log, and the answer both a watcher and fetchSearch call
 */
const loggingServer = () => {
    const requests: [object, number, number][] = [];
    const answer = (filters: object, page: number, size: number) => {
        requests.push([filters, page, size]);
        return Promise.resolve({ items: buildArticles(1, 'tech', page), totalItems: 30 });
    };
    return { requests, answer };
};

/**
 * One search page of `category`, holding the single article `id`.
 *
 * @param category - the article's category
 * @param id - the article's id
 * @returns the apiCall
 */
const pageOf = (category: string, id: number) =>
    apiResolve({ items: buildArticles(1, category, id), totalItems: 30 });

describe('UNIT · fetchSearch applies the page it fetches', () => {
    it.each([
        {
            change: 'new filters, from page 3',
            from: 3,
            filters: { category: 'b' },
            page: 1,
            size: 10
        },
        { change: 'a new page size, from page 1', from: 1, filters: {}, page: 2, size: 25 }
    ])(
        'an active watchSearch asks the server for no other page than the one given ($change)',
        async ({ from, filters, page, size }) => {
            const { searchApi } = make();
            const server = loggingServer();
            searchApi.watchSearch(server.answer);
            searchApi.pageCurrent.value = from;
            await flush();
            server.requests.length = 0;

            await searchApi.fetchSearch(
                () => server.answer(filters, page, size),
                filters,
                page,
                size
            );
            await flush();

            expect(server.requests).toEqual([[filters, page, size]]);
        }
    );

    it('no frame shows a page left over from before it as the current page', async () => {
        const { searchApi } = make();
        await searchApi.fetchSearch(pageOf('b', 203), { category: 'b' }, 3);
        await searchApi.fetchSearch(pageOf('a', 103), { category: 'a' }, 3);
        const frames: { page: number; ids: number[]; isPlaceholder: boolean }[] = [];
        // A pre-flush watcher sees what a render in the same flush would.
        const stop = watch(
            [searchApi.pageCurrent, searchApi.pageItemList, searchApi.isPlaceholder],
            ([page, items, isPlaceholder]) =>
                frames.push({ page, ids: items.map((item) => item.id), isPlaceholder })
        );

        await searchApi.fetchSearch(pageOf('b', 201), { category: 'b' }, 1);
        await flush();
        stop();

        expect(frames.at(-1)).toEqual({ page: 1, ids: [201], isPlaceholder: false });
        expect(frames.filter((frame) => frame.page !== 1)).toEqual([]);
    });
});
