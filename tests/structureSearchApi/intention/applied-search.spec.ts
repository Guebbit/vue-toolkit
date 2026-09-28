/**
 * INTENTION — what is on screen follows the APPLIED search, never the live filters.
 *
 *   - editing the live filters in place (a form's v-model) changes nothing until search();
 *   - the total belongs to the search, not to one page: it survives a page change while the
 *     next page loads, so the pager does not vanish;
 *   - pageItemList keeps the previous page's items while the next page or search loads too,
 *     flagged by isPlaceholder, instead of dropping to [] and back; the fallback is the most
 *     recently updated page;
 *   - a search's bucket `key` is part of what is applied;
 *   - search() on the page already shown, cached and fresh, still settles through onSuccess.
 */

import { makeSearchComposable, clearAllInstances, flush } from '../_helpers/harness';
import { deferred } from '../../structureRestApi/_helpers/fakeApi';
import { useFakeClock, advance, restoreClock } from '../../structureRestApi/_helpers/time';
import type { ISearchResult } from '../../../src/composables/structureSearchApi';

afterEach(clearAllInstances);

interface IItem {
    id: number;
    name: string;
}

/** Matches the trailing `{ signal }` context every apiCall receives. */
const anyContext = expect.objectContaining({ signal: expect.any(AbortSignal) });

interface IFilters {
    name?: string;
}

/** A search operation answering one item per page, named after the filters it received. */
const searchOperation = () =>
    jest.fn((filters: IFilters, page: number) =>
        Promise.resolve<ISearchResult<IItem>>({
            items: [{ id: page, name: filters.name ?? '' }],
            totalItems: 30
        })
    );

describe('INTENTION · the applied search', () => {
    it('editing the live filters in place neither moves the list nor fetches', async () => {
        const { searchApi, filters } = makeSearchComposable<IItem, number, IFilters>(
            {},
            { name: 'first' }
        );
        const operation = searchOperation();
        searchApi.watchSearch(operation);
        await flush();
        expect(operation).toHaveBeenCalledTimes(1);

        filters.value.name = 'typing';
        await flush();

        expect(operation).toHaveBeenCalledTimes(1);
        expect(searchApi.pageItemList.value).toEqual([{ id: 1, name: 'first' }]);
    });

    it('search() applies the edited filters', async () => {
        const { searchApi, filters } = makeSearchComposable<IItem, number, IFilters>(
            {},
            { name: 'first' }
        );
        const operation = searchOperation();
        const { search } = searchApi.watchSearch(operation);
        await flush();

        filters.value.name = 'second';
        await search();

        expect(operation).toHaveBeenLastCalledWith({ name: 'second' }, 1, 10, anyContext);
        expect(searchApi.pageItemList.value).toEqual([{ id: 1, name: 'second' }]);
    });

    it('the total survives a page change while the next page loads', async () => {
        const { searchApi } = makeSearchComposable<IItem, number, IFilters>();
        const pages: ReturnType<typeof deferred<ISearchResult<IItem>>>[] = [];
        searchApi.watchSearch(() => {
            pages.push(deferred<ISearchResult<IItem>>());
            return pages.at(-1)!.promise;
        });
        await flush();
        pages[0].resolve({ items: [{ id: 1, name: 'a' }], totalItems: 30 });
        await flush();

        searchApi.pageCurrent.value = 2;
        await flush();

        expect(pages).toHaveLength(2); // page 2 is still loading
        expect(searchApi.totalItems.value).toBe(30);
        expect(searchApi.pageTotal.value).toBe(3);
    });

    it('pageItemList keeps the previous page while the next one loads, flagged by isPlaceholder', async () => {
        const { searchApi } = makeSearchComposable<IItem, number, IFilters>();
        const pages: ReturnType<typeof deferred<ISearchResult<IItem>>>[] = [];
        searchApi.watchSearch(() => {
            pages.push(deferred<ISearchResult<IItem>>());
            return pages.at(-1)!.promise;
        });
        await flush();
        pages[0].resolve({ items: [{ id: 1, name: 'a' }], totalItems: 30 });
        await flush();

        expect(searchApi.pageItemList.value).toEqual([{ id: 1, name: 'a' }]);
        expect(searchApi.isPlaceholder.value).toBe(false);

        searchApi.pageCurrent.value = 2;
        await flush();

        // Page 2 is still in flight: page 1's items stay on screen instead of dropping to [].
        expect(pages).toHaveLength(2);
        expect(searchApi.pageItemList.value).toEqual([{ id: 1, name: 'a' }]);
        expect(searchApi.isPlaceholder.value).toBe(true);

        pages[1].resolve({ items: [{ id: 2, name: 'a' }], totalItems: 30 });
        await flush();

        expect(searchApi.pageItemList.value).toEqual([{ id: 2, name: 'a' }]);
        expect(searchApi.isPlaceholder.value).toBe(false);
    });

    it('pageItemList keeps the previous search on screen while new filters load, flagged by isPlaceholder', async () => {
        const { searchApi, filters } = makeSearchComposable<IItem, number, IFilters>(
            {},
            { name: 'first' }
        );
        const pages: ReturnType<typeof deferred<ISearchResult<IItem>>>[] = [];
        const { search } = searchApi.watchSearch(() => {
            pages.push(deferred<ISearchResult<IItem>>());
            return pages.at(-1)!.promise;
        });
        await flush();
        pages[0].resolve({ items: [{ id: 1, name: 'first' }], totalItems: 30 });
        await flush();

        filters.value.name = 'second';
        void search();
        await flush();

        // The new search is still in flight: the previous one stays on screen, flagged.
        expect(pages).toHaveLength(2);
        expect(searchApi.pageItemList.value).toEqual([{ id: 1, name: 'first' }]);
        expect(searchApi.isPlaceholder.value).toBe(true);
    });

    it('isPlaceholder is false on a genuinely empty first load (nothing to show as a placeholder)', async () => {
        const { searchApi } = makeSearchComposable<IItem, number, IFilters>();
        const first = deferred<ISearchResult<IItem>>();
        searchApi.watchSearch(() => first.promise);
        await flush();

        expect(searchApi.pageItemList.value).toEqual([]);
        expect(searchApi.isPlaceholder.value).toBe(false);
    });

    it('a search with a key shows its own entry', async () => {
        const { searchApi } = makeSearchComposable<IItem, number, IFilters>();

        const result = await searchApi.fetchSearch(
            () => Promise.resolve({ items: [{ id: 1, name: 'a' }], totalItems: 7 }),
            {},
            1,
            10,
            { key: ['widget'] }
        );

        expect(result.totalItems).toBe(7);
        expect(searchApi.totalItems.value).toBe(7);
        expect(searchApi.pageItemList.value).toEqual([{ id: 1, name: 'a' }]);
        expect(searchApi.searchGet({}, 1, 10, { key: ['widget'] })).toEqual([{ id: 1, name: 'a' }]);
    });

    it('search() on the page already shown, cached and fresh, settles without a fetch', async () => {
        const { searchApi } = makeSearchComposable<IItem, number, IFilters>();
        const operation = searchOperation();
        const onSuccess = jest.fn();
        const { search } = searchApi.watchSearch(operation, { onSuccess });
        await flush();
        expect(onSuccess).toHaveBeenCalledTimes(1);

        await search();
        await flush();

        expect(operation).toHaveBeenCalledTimes(1);
        expect(onSuccess).toHaveBeenCalledTimes(2);
    });
});

/**
 * A search page answering one item and a total.
 *
 * @param id - the item's id
 * @param totalItems - the total it reports
 * @returns the apiCall
 */
const pageOf = (id: number, totalItems: number) => () =>
    Promise.resolve({ items: [{ id, name: 'a' }], totalItems });

describe('INTENTION · the applied search, on a fake clock', () => {
    beforeEach(() => useFakeClock());
    afterEach(restoreClock);

    it('the total on an uncached page comes from the MOST RECENTLY cached page, not any cached one', async () => {
        const { searchApi } = makeSearchComposable<IItem, number, IFilters>();

        await searchApi.fetchSearch(pageOf(1, 10), {}, 1, 10);
        await advance(1000);
        await searchApi.fetchSearch(pageOf(2, 20), {}, 2, 10);

        // Page 3 has no cache entry of its own: totalItems falls back to the most recently cached
        // page, which must be page 2 (fetched later) over page 1, not merely "some" cached page.
        searchApi.pageCurrent.value = 3;
        expect(searchApi.totalItems.value).toBe(20);
    });

    it('the placeholder is the most recently UPDATED page, not the one cached last', async () => {
        const { searchApi } = makeSearchComposable<IItem, number, IFilters>();
        await searchApi.fetchSearch(pageOf(1, 10), {}, 1, 10);
        await advance(1000);
        await searchApi.fetchSearch(pageOf(2, 20), {}, 2, 10);
        await advance(1000);
        // Page 1 again, answered anew: now the freshest, though page 2 was cached after it.
        await searchApi.fetchSearch(pageOf(11, 30), {}, 1, 10, { forced: true });

        searchApi.pageCurrent.value = 3;

        expect(searchApi.pageItemList.value).toEqual([{ id: 11, name: 'a' }]);
        expect(searchApi.isPlaceholder.value).toBe(true);
        expect(searchApi.totalItems.value).toBe(30);
    });
});
