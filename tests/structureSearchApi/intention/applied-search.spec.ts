/**
 * INTENTION — what is on screen follows the APPLIED search, never the live filters.
 *
 *   - editing the live filters in place (a form's v-model) changes nothing until search();
 *   - the total belongs to the search, not to one page: it survives a page change while the
 *     next page loads, so the pager does not vanish;
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

/** Matches the trailing `{ signal }` context every apiCall now receives (see V2.1). */
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

    it('the total on an uncached page comes from the MOST RECENTLY cached page, not any cached one', async () => {
        useFakeClock();
        const { searchApi } = makeSearchComposable<IItem, number, IFilters>();

        await searchApi.fetchSearch(
            () => Promise.resolve({ items: [{ id: 1, name: 'a' }], totalItems: 10 }),
            {},
            1,
            10
        );
        await advance(1000);
        await searchApi.fetchSearch(
            () => Promise.resolve({ items: [{ id: 2, name: 'a' }], totalItems: 20 }),
            {},
            2,
            10
        );

        // Page 3 has no cache entry of its own: totalItems falls back to knownTotal, which must
        // pick page 2 (fetched later) over page 1, not merely "some" cached page.
        searchApi.pageCurrent.value = 3;
        expect(searchApi.totalItems.value).toBe(20);

        restoreClock();
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
