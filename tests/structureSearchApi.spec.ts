/**
 * useStructureSearchApi: search bound to one filtersSource, correcting
 * pageItemList to be search-scoped (searchGet) instead of the whole-dictionary
 * offline pagination the internal restApi exposes on its own.
 */

import { ref } from 'vue';
import { makeSearchComposable, clearAllInstances } from './structureSearchApi/_helpers/harness';
import { buildArticles, type IArticle } from './structureRestApi/_helpers/fixtures';

/** Flushes the microtask queue past runQuery's several internal `.then` hops. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(clearAllInstances);

describe('useStructureSearchApi', () => {
    describe('pageItemList', () => {
        it('reflects the current search page, not the whole dictionary', async () => {
            const { searchApi, filters } = makeSearchComposable<IArticle, number>(
                {},
                { category: 'tech' }
            );

            const TECH = buildArticles(3, 'tech', 1);
            await searchApi.fetchSearch(() => Promise.resolve(TECH), filters.value, 1, 10);

            expect(searchApi.pageItemList.value).toEqual(TECH);
        });

        it('stays correct after a DIFFERENT search populates the dictionary too', async () => {
            const { searchApi } = makeSearchComposable<IArticle, number, { category: string }>(
                {},
                { category: 'tech' }
            );

            const TECH = buildArticles(3, 'tech', 1);
            const DESIGN = buildArticles(3, 'design', 101);

            await searchApi.fetchSearch(() => Promise.resolve(TECH), { category: 'tech' }, 1, 10);
            // A second, unrelated search adds more records to the same local dictionary
            await searchApi.fetchSearch(
                () => Promise.resolve(DESIGN),
                { category: 'design' },
                1,
                10
            );

            // pageItemList is still scoped to filters.value ({ category: 'tech' }), unaffected
            // by the design search sharing the same dictionary — this is the bug the internal
            // restApi's own pageItemList (whole-dictionary slice) would NOT protect against.
            expect(searchApi.pageItemList.value).toEqual(TECH);
        });

        it('updates when pageCurrent changes', async () => {
            const { searchApi, filters } = makeSearchComposable<IArticle, number>(
                {},
                { category: 'tech' }
            );

            const PAGE1 = buildArticles(10, 'tech', 1);
            const PAGE2 = buildArticles(10, 'tech', 11);
            await searchApi.fetchSearch(() => Promise.resolve(PAGE1), filters.value, 1, 10);
            await searchApi.fetchSearch(() => Promise.resolve(PAGE2), filters.value, 2, 10);

            expect(searchApi.pageItemList.value).toEqual(PAGE1);
            searchApi.pageCurrent.value = 2;
            expect(searchApi.pageItemList.value).toEqual(PAGE2);
        });

        it('updates when filtersSource changes', async () => {
            const { searchApi, filters } = makeSearchComposable<
                IArticle,
                number,
                { category: string }
            >({}, { category: 'tech' });

            const TECH = buildArticles(3, 'tech', 1);
            const DESIGN = buildArticles(3, 'design', 101);
            await searchApi.fetchSearch(() => Promise.resolve(TECH), { category: 'tech' }, 1, 10);
            await searchApi.fetchSearch(
                () => Promise.resolve(DESIGN),
                { category: 'design' },
                1,
                10
            );

            expect(searchApi.pageItemList.value).toEqual(TECH);
            filters.value = { category: 'design' };
            expect(searchApi.pageItemList.value).toEqual(DESIGN);
        });
    });

    describe('isPageCached / isPaginateCached', () => {
        it('isPageCached reflects whether fetchSearch would be served from cache', async () => {
            const { searchApi, filters } = makeSearchComposable<IArticle, number>(
                {},
                { category: 'tech' }
            );

            expect(searchApi.isPageCached()).toBe(false);
            await searchApi.fetchSearch(
                () => Promise.resolve(buildArticles(3)),
                filters.value,
                1,
                10
            );
            expect(searchApi.isPageCached()).toBe(true);
        });

        it('isPaginateCached reflects whether fetchPaginate would be served from cache', async () => {
            const { searchApi } = makeSearchComposable<IArticle, number>();

            expect(searchApi.isPaginateCached()).toBe(false);
            await searchApi.fetchPaginate(() => Promise.resolve(buildArticles(3)), 1, 10);
            expect(searchApi.isPaginateCached()).toBe(true);
        });
    });

    describe('watchSearch', () => {
        it('is pre-bound to the wrapper filtersSource', async () => {
            const { searchApi } = makeSearchComposable<IArticle, number>({}, { category: 'tech' });
            const apiCall = jest.fn(() => Promise.resolve(buildArticles(3, 'tech', 1)));

            const { stop } = searchApi.watchSearch(apiCall);
            await flush();

            expect(apiCall).toHaveBeenCalledTimes(1);
            expect(searchApi.pageItemList.value).toEqual(buildArticles(3, 'tech', 1));
            stop();
        });

        it('search() lets a caller trigger a fetch on demand', async () => {
            const { searchApi } = makeSearchComposable<IArticle, number>({}, { category: 'tech' });
            const apiCall = jest.fn(() => Promise.resolve(buildArticles(3, 'tech', 1)));

            const { stop, search } = searchApi.watchSearch(apiCall, { immediate: false });
            expect(apiCall).not.toHaveBeenCalled();

            await search();
            expect(apiCall).toHaveBeenCalledTimes(1);
            stop();
        });
    });
});
