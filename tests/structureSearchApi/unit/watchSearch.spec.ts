/**
 * UNIT — watchSearch: fetchSearch's reactive counterpart, pre-bound to the composable's own
 * filtersSource. An active query (TanStack useQuery) keeps the applied search's current page
 * fetched — re-running on invalidation and on a dependsOn change — while `search(forced?)` applies
 * the live filters and fetches, from cache unless `forced`.
 *
 *   - fires immediately (by default) using pageCurrent/pageSize and the current filters
 *   - refetches when pageCurrent or pageSize change; a pageSize change goes back to page 1
 *     in that same fetch
 *   - does NOT refetch on its own when the filters change (filters are read, not watched), and
 *     paging after a live edit keeps using the APPLIED filters
 *   - immediate: false skips the initial run
 *   - search(): triggers a fetch on demand with whatever filters/page/pageSize hold now,
 *     resolving { items, totalItems } (ISearchResult<T>)
 *   - search(true): forces even when the page is already cached
 *   - onSuccess/onError/onSettled fire for search() and for automatic runs alike
 *   - stop(): stops the pageCurrent/pageSize watcher
 */

import { useStructureSearchApi } from '../../../src/composables/structureSearchApi';
import {
    runTracked,
    makeSearchComposable,
    clearAllInstances,
    flush,
    newTestClient,
    DEFAULT_STALE_TIME
} from '../_helpers/harness';
import { buildArticles, type IArticle } from '../../structureRestApi/_helpers/fixtures';

afterEach(clearAllInstances);

/** Tech filters unless given: a fresh object per call, since some tests edit it in place. */
const make = (initialFilters?: { category?: string }) =>
    makeSearchComposable<IArticle, number, { category?: string }>(
        {},
        initialFilters ?? { category: 'tech' }
    );
const TECH = buildArticles(5, 'tech', 1);

/** Records every (filters, page, pageSize) triple it was called with. Resolves ISearchResult<T>. */
const fakeApiCall = (items: IArticle[] = TECH) =>
    jest.fn((_filters: { category?: string }, _page: number, _pageSize: number) =>
        Promise.resolve({ items, totalItems: items.length })
    );

describe('UNIT · watchSearch', () => {
    it('fires immediately, reading the current filters/page/pageSize', () => {
        const { searchApi } = make();
        const apiCall = fakeApiCall();
        const { stop } = searchApi.watchSearch(apiCall);

        expect(apiCall).toHaveBeenCalledTimes(1);
        expect(apiCall).toHaveBeenCalledWith({ category: 'tech' }, 1, 10);
        stop();
    });

    it('accepts a getter as filtersSource, bound at construction', () => {
        const filters = { category: 'tech' };
        const searchApi = runTracked(() =>
            useStructureSearchApi<IArticle, number>(() => filters, {
                resourceKey: 'resource',
                staleTime: DEFAULT_STALE_TIME,
                queryClient: newTestClient()
            })
        );
        const apiCall = fakeApiCall();
        const { stop } = searchApi.watchSearch(apiCall);

        expect(apiCall).toHaveBeenCalledWith({ category: 'tech' }, 1, 10);
        stop();
    });

    it('skips the initial run when immediate is false', () => {
        const { searchApi } = make({});
        const apiCall = fakeApiCall();
        const { stop } = searchApi.watchSearch(apiCall, { immediate: false });

        expect(apiCall).not.toHaveBeenCalled();
        stop();
    });

    it('refetches when pageCurrent changes', async () => {
        const { searchApi } = make({});
        const apiCall = fakeApiCall();
        const { stop } = searchApi.watchSearch(apiCall);
        await flush();

        searchApi.pageCurrent.value = 2;
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(2);
        expect(apiCall).toHaveBeenLastCalledWith({}, 2, 10);
        stop();
    });

    it('refetches when pageSize changes', async () => {
        const { searchApi } = make({});
        const apiCall = fakeApiCall();
        const { stop } = searchApi.watchSearch(apiCall);
        await flush();

        searchApi.pageSize.value = 25;
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(2);
        expect(apiCall).toHaveBeenLastCalledWith({}, 1, 25);
        stop();
    });

    it('a pageSize change on a later page fetches page 1 of the new size — once, never the old page', async () => {
        const { searchApi } = make({});
        const apiCall = fakeApiCall();
        const { stop } = searchApi.watchSearch(apiCall);
        await flush();
        searchApi.pageCurrent.value = 3;
        await flush();
        apiCall.mockClear();

        searchApi.pageSize.value = 25;
        await flush();

        expect(searchApi.pageCurrent.value).toBe(1);
        expect(apiCall.mock.calls).toEqual([[{}, 1, 25]]);
        stop();
    });

    it('paging after a live-filter edit keeps using the APPLIED filters', async () => {
        const { filters, searchApi } = make();
        const apiCall = fakeApiCall();
        const { stop } = searchApi.watchSearch(apiCall);
        await flush();

        // edited in place (a form's v-model) and replaced wholesale, then paged
        filters.value.category = 'typing';
        searchApi.pageCurrent.value = 2;
        await flush();
        filters.value = { category: 'replaced' };
        searchApi.pageCurrent.value = 3;
        await flush();

        expect(apiCall.mock.calls).toEqual([
            [{ category: 'tech' }, 1, 10],
            [{ category: 'tech' }, 2, 10],
            [{ category: 'tech' }, 3, 10]
        ]);
        stop();
    });

    it('does not refetch on its own when filters change', async () => {
        const { filters, searchApi } = make();
        const apiCall = fakeApiCall();
        const { stop } = searchApi.watchSearch(apiCall);
        await flush();

        filters.value = { category: 'design' };
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(1);
        stop();
    });

    it('search() triggers a fetch on demand with the current filters/page/pageSize', async () => {
        const { filters, searchApi } = make();
        const apiCall = fakeApiCall();
        const { stop, search } = searchApi.watchSearch(apiCall, { immediate: false });

        filters.value = { category: 'design' };
        await search();

        expect(apiCall).toHaveBeenCalledTimes(1);
        expect(apiCall).toHaveBeenCalledWith({ category: 'design' }, 1, 10);
        stop();
    });

    it('search() resolves with { items, totalItems } and stores the items', async () => {
        const { searchApi } = make({});
        const { stop, search } = searchApi.watchSearch(fakeApiCall(), { immediate: false });

        await expect(search()).resolves.toEqual({ items: TECH, totalItems: TECH.length });
        expect(searchApi.getRecord(1)).toEqual(TECH[0]);
        stop();
    });

    it('a repeated search() while fresh is served from cache (apiCall not re-invoked)', async () => {
        const { searchApi } = make({});
        const apiCall = fakeApiCall();
        const { stop, search } = searchApi.watchSearch(apiCall, { immediate: false });

        await search();
        await search();

        expect(apiCall).toHaveBeenCalledTimes(1);
        stop();
    });

    it('search(true) forces a re-fetch even when cached', async () => {
        const { searchApi } = make({});
        const apiCall = fakeApiCall();
        const { stop, search } = searchApi.watchSearch(apiCall, { immediate: false });

        await search();
        await search(true);

        expect(apiCall).toHaveBeenCalledTimes(2);
        stop();
    });

    it('calls onSuccess/onSettled with the fetched items and filters, via an explicit search()', async () => {
        const { searchApi } = make();
        const onSuccess = jest.fn();
        const onSettled = jest.fn();
        const onError = jest.fn();
        const { stop, search } = searchApi.watchSearch(fakeApiCall(), {
            immediate: false,
            onSuccess,
            onError,
            onSettled
        });

        await search();

        expect(onSuccess).toHaveBeenCalledWith(TECH, { category: 'tech' });
        expect(onSettled).toHaveBeenCalledWith(TECH, undefined, { category: 'tech' });
        expect(onError).not.toHaveBeenCalled();
        stop();
    });

    it('onSuccess/onSettled also fire for the immediate/automatic run, not just an explicit search()', async () => {
        const { searchApi } = make();
        const onSuccess = jest.fn();
        const onSettled = jest.fn();
        const onError = jest.fn();
        const apiCall = fakeApiCall();
        const { stop } = searchApi.watchSearch(apiCall, { onSuccess, onError, onSettled });
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(1);
        expect(onSuccess).toHaveBeenCalledWith(TECH, { category: 'tech' });
        expect(onSettled).toHaveBeenCalledWith(TECH, undefined, { category: 'tech' });
        expect(onError).not.toHaveBeenCalled();
        stop();
    });

    it('onSuccess/onSettled also fire for a pageCurrent-driven automatic refetch', async () => {
        const { searchApi } = make({});
        const onSuccess = jest.fn();
        const onSettled = jest.fn();
        const { stop } = searchApi.watchSearch(fakeApiCall(), { onSuccess, onSettled });
        await flush();
        onSuccess.mockClear();
        onSettled.mockClear();

        searchApi.pageCurrent.value = 2;
        await flush();

        expect(onSuccess).toHaveBeenCalledWith(TECH, {});
        expect(onSettled).toHaveBeenCalledWith(TECH, undefined, {});
        stop();
    });

    it('a rejected search with NO callbacks resolves undefined without throwing', async () => {
        const { searchApi } = make();
        const apiCall = jest.fn(() => Promise.reject(new Error('network error')));
        // no onError/onSettled: the optional-chained calls must not blow up
        const { stop, search } = searchApi.watchSearch(apiCall, { immediate: false });

        await expect(search()).resolves.toBeUndefined();
        stop();
    });

    it('calls onError/onSettled when the search rejects, and search() does not throw', async () => {
        const { searchApi } = make();
        const error = new Error('network error');
        const apiCall = jest.fn(() => Promise.reject(error));
        const onSuccess = jest.fn();
        const onError = jest.fn();
        const onSettled = jest.fn();
        const { stop, search } = searchApi.watchSearch(apiCall, {
            immediate: false,
            onSuccess,
            onError,
            onSettled
        });

        await expect(search()).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith(error, { category: 'tech' });
        expect(onSettled).toHaveBeenCalledWith(undefined, error, { category: 'tech' });
        expect(onSuccess).not.toHaveBeenCalled();
        stop();
    });

    it('stop() stops the pageCurrent/pageSize watcher', async () => {
        const { searchApi } = make({});
        const apiCall = fakeApiCall();
        const { stop } = searchApi.watchSearch(apiCall);
        await flush();
        stop();

        searchApi.pageCurrent.value = 2;
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(1);
    });
});

describe('UNIT · watchSearch refetch', () => {
    it('refetch() resolves with the cached page even when the fetch fails', async () => {
        const { searchApi } = make();
        let fail = false;
        const handle = searchApi.watchSearch(() =>
            fail
                ? Promise.reject(new Error('boom'))
                : Promise.resolve({ items: TECH, totalItems: 5 })
        );
        await flush();

        fail = true;
        const result = await handle.refetch();

        expect(result?.items).toEqual(TECH);
        expect((handle.error.value as Error).message).toBe('boom');
    });
});
