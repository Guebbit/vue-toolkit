/**
 * useStructureSearchApi: search bound to one filtersSource, correcting
 * pageItemList/pageTotal/totalItems to be scoped to the last APPLIED search
 * (searchGet) instead of the whole-dictionary offline pagination the internal
 * restApi exposes on its own, and instead of the LIVE filtersSource.
 */

import {
    makeSearchComposable,
    clearAllInstances,
    flush
} from './structureSearchApi/_helpers/harness';
import { buildArticles, type IArticle } from './structureRestApi/_helpers/fixtures';

afterEach(clearAllInstances);

describe('useStructureSearchApi', () => {
    describe('pageItemList', () => {
        it('reflects the current search page, not the whole dictionary', async () => {
            const { searchApi, filters } = makeSearchComposable<IArticle, number>(
                {},
                { category: 'tech' }
            );

            const TECH = buildArticles(3, 'tech', 1);
            await searchApi.fetchSearch(
                () => Promise.resolve({ items: TECH, totalItems: TECH.length }),
                filters.value,
                1,
                10
            );

            expect(searchApi.pageItemList.value).toEqual(TECH);
        });

        it('stays correct after a DIFFERENT search populates the dictionary too', async () => {
            const { searchApi } = makeSearchComposable<IArticle, number, { category: string }>(
                {},
                { category: 'tech' }
            );

            const TECH = buildArticles(3, 'tech', 1);
            const DESIGN = buildArticles(3, 'design', 101);

            // an unrelated search populates the shared item dictionary FIRST
            await searchApi.fetchSearch(
                () => Promise.resolve({ items: DESIGN, totalItems: DESIGN.length }),
                { category: 'design' },
                1,
                10
            );
            // then the search we actually care about is the one applied LAST
            await searchApi.fetchSearch(
                () => Promise.resolve({ items: TECH, totalItems: TECH.length }),
                { category: 'tech' },
                1,
                10
            );

            // pageItemList is scoped to the LAST APPLIED search ({ category: 'tech' }), unaffected
            // by the design search's records sharing the same dictionary — this is the bug the
            // internal restApi's own pageItemList (whole-dictionary slice) would NOT protect
            // against.
            expect(searchApi.pageItemList.value).toEqual(TECH);
        });

        it('updates when pageCurrent changes', async () => {
            const { searchApi, filters } = makeSearchComposable<IArticle, number>(
                {},
                { category: 'tech' }
            );

            const PAGE1 = buildArticles(10, 'tech', 1);
            const PAGE2 = buildArticles(10, 'tech', 11);
            await searchApi.fetchSearch(
                () => Promise.resolve({ items: PAGE1, totalItems: 20 }),
                filters.value,
                1,
                10
            );
            expect(searchApi.pageItemList.value).toEqual(PAGE1);

            // fetchSearch(..., 2, 10) applies page 2 itself (V2.6): pageItemList already shows it,
            // with no separate pageCurrent assignment needed.
            await searchApi.fetchSearch(
                () => Promise.resolve({ items: PAGE2, totalItems: 20 }),
                filters.value,
                2,
                10
            );

            expect(searchApi.pageCurrent.value).toBe(2);
            expect(searchApi.pageItemList.value).toEqual(PAGE2);
        });

        // Editing the live filters ref must NOT change what's on screen until a search actually
        // runs with them: a list bound to the live filters blanks itself while the user types,
        // before they press Search.
        it('does NOT update when filtersSource changes alone, only once a search is run with it', async () => {
            const { searchApi, filters } = makeSearchComposable<
                IArticle,
                number,
                { category: string }
            >({}, { category: 'tech' });

            const TECH = buildArticles(3, 'tech', 1);
            const DESIGN = buildArticles(3, 'design', 101);
            await searchApi.fetchSearch(
                () => Promise.resolve({ items: TECH, totalItems: TECH.length }),
                { category: 'tech' },
                1,
                10
            );

            expect(searchApi.pageItemList.value).toEqual(TECH);

            // editing the live ref alone must NOT move pageItemList — it's still showing the
            // last APPLIED search ('tech'), not a preview of what 'design' would show
            filters.value = { category: 'design' };
            expect(searchApi.pageItemList.value).toEqual(TECH);

            // only an actual search with the new filters applies them
            await searchApi.fetchSearch(
                () => Promise.resolve({ items: DESIGN, totalItems: DESIGN.length }),
                filters.value,
                1,
                10
            );
            expect(searchApi.pageItemList.value).toEqual(DESIGN);
        });
    });

    describe('totalItems / pageTotal', () => {
        it('reflect the last applied search, surviving a cache hit', async () => {
            const { searchApi, filters } = makeSearchComposable<IArticle, number>(
                { staleTime: 3_600_000 },
                { category: 'tech' }
            );

            const TECH = buildArticles(3, 'tech', 1);
            const apiCall = jest.fn(() => Promise.resolve({ items: TECH, totalItems: 25 }));
            await searchApi.fetchSearch(apiCall, filters.value, 1, 10);

            expect(searchApi.totalItems.value).toBe(25);
            expect(searchApi.pageTotal.value).toBe(3); // ceil(25 / 10)

            await searchApi.fetchSearch(apiCall, filters.value, 1, 10); // cache hit
            expect(apiCall).toHaveBeenCalledTimes(1);
            expect(searchApi.totalItems.value).toBe(25);
        });
    });

    describe('isPageCached / isPaginateCached', () => {
        it('isPageCached reflects whether fetchSearch would be served from cache', async () => {
            const { searchApi, filters } = makeSearchComposable<IArticle, number>(
                {},
                { category: 'tech' }
            );
            const TECH = buildArticles(3);

            expect(searchApi.isPageCached()).toBe(false);
            await searchApi.fetchSearch(
                () => Promise.resolve({ items: TECH, totalItems: TECH.length }),
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
            const TECH = buildArticles(3, 'tech', 1);
            const apiCall = jest.fn(() =>
                Promise.resolve({ items: TECH, totalItems: TECH.length })
            );

            const { stop } = searchApi.watchSearch(apiCall);
            await flush();

            expect(apiCall).toHaveBeenCalledTimes(1);
            expect(searchApi.pageItemList.value).toEqual(TECH);
            stop();
        });

        it('search() lets a caller trigger a fetch on demand', async () => {
            const { searchApi } = makeSearchComposable<IArticle, number>({}, { category: 'tech' });
            const TECH = buildArticles(3, 'tech', 1);
            const apiCall = jest.fn(() =>
                Promise.resolve({ items: TECH, totalItems: TECH.length })
            );

            const { stop, search } = searchApi.watchSearch(apiCall, { immediate: false });
            expect(apiCall).not.toHaveBeenCalled();

            await search();
            expect(apiCall).toHaveBeenCalledTimes(1);
            stop();
        });
    });
});
