/**
 * SEARCH · latest page — with the current page uncached, `totalItems` reads the applied search's
 * most recently updated cached page, and only pages of THAT search count.
 *   - the newer `dataUpdatedAt` wins, whichever page was cached first;
 *   - equal timestamps: the first page found wins, stably;
 *   - with no applied search nothing is picked, even with pages cached;
 *   - a look-alike (other scope, filters, kind, bucket key, data-less) is never a page.
 *
 * The applied search's page 1 is held in flight, so `totalItems` cannot come from the current
 * page and the answer is the freshest-page pick alone.
 */

import { makeSearchComposable, clearAllInstances, flush, newTestClient } from '../_helpers/harness';
import { seedPage } from '../_helpers/seedPages';
import { deferred } from '../../structureRestApi/_helpers/fakeApi';
import { BASE_NOW } from '../../structureRestApi/_helpers/time';
import type { ISearchResult } from '../../../src/composables/structureSearchApi';

afterEach(clearAllInstances);

const filters = { category: 'tech' };

/** A composable whose applied search (`filters`, page 1) is in flight. */
const makeApplied = async (settingsKey?: string[]) => {
    const queryClient = newTestClient();
    const { searchApi } = makeSearchComposable({ queryClient });
    void searchApi.fetchSearch(
        () => deferred<ISearchResult<never>>().promise,
        filters,
        1,
        10,
        settingsKey ? { key: settingsKey } : {}
    );
    await flush();
    return { searchApi, queryClient };
};

describe('SEARCH · latest page', () => {
    it.each([
        ['the first cached page is newer', 2, 1, 10],
        ['the second cached page is newer', 1, 2, 20]
    ])('%s: totalItems reads the newer one', async (_name, firstAt, secondAt, expected) => {
        const { searchApi, queryClient } = await makeApplied();
        seedPage(queryClient, {
            filters,
            page: 2,
            totalItems: 10,
            updatedAt: BASE_NOW + firstAt * 1000
        });
        seedPage(queryClient, {
            filters,
            page: 3,
            totalItems: 20,
            updatedAt: BASE_NOW + secondAt * 1000
        });
        await flush();

        expect(searchApi.totalItems.value).toBe(expected);
    });

    it('equal timestamps: the first page found wins, and keeps winning across reads', async () => {
        const { searchApi, queryClient } = await makeApplied();
        seedPage(queryClient, { filters, page: 2, totalItems: 10, updatedAt: BASE_NOW });
        seedPage(queryClient, { filters, page: 3, totalItems: 20, updatedAt: BASE_NOW });
        await flush();

        expect(searchApi.totalItems.value).toBe(10);
        seedPage(queryClient, { filters: { other: 1 }, totalItems: 99 }); // unrelated cache event
        await flush();
        expect(searchApi.totalItems.value).toBe(10);
    });

    it('with no applied search nothing is picked, even with pages cached', async () => {
        const queryClient = newTestClient();
        const { searchApi } = makeSearchComposable({ queryClient });
        seedPage(queryClient, { filters, page: 1, totalItems: 50 });
        await flush();

        expect(searchApi.totalItems.value).toBe(0);
        expect(searchApi.pageItemList.value).toEqual([]);
    });

    it('a page of the same scope but other filters is not a page of this search', async () => {
        const { searchApi, queryClient } = await makeApplied();
        seedPage(queryClient, { filters: { category: 'news' }, page: 2, totalItems: 99 });
        await flush();

        expect(searchApi.totalItems.value).toBe(0);
    });

    it('a page of the same filters under another scope is not a page of this search', async () => {
        const { searchApi, queryClient } = await makeApplied();
        seedPage(queryClient, { filters, page: 2, scope: ['other'], totalItems: 99 });
        await flush();

        expect(searchApi.totalItems.value).toBe(0);
    });

    it.each(['all', 'target', 'page'])('a %s entry is not a search page', async (kind) => {
        const { searchApi, queryClient } = await makeApplied();
        seedPage(queryClient, { filters, page: 2, kind, totalItems: 99 });
        await flush();

        expect(searchApi.totalItems.value).toBe(0);
    });

    it('a key with an extra segment is not a page of a search without a bucket key', async () => {
        const { searchApi, queryClient } = await makeApplied();
        seedPage(queryClient, { filters, page: 2, key: ['bucket'], totalItems: 99 });
        await flush();

        expect(searchApi.totalItems.value).toBe(0);
    });

    it('a page of another bucket key is not a page, the matching one is', async () => {
        const { searchApi, queryClient } = await makeApplied(['mine']);
        seedPage(queryClient, { filters, page: 2, key: ['theirs'], totalItems: 99 });
        seedPage(queryClient, { filters, page: 2, totalItems: 98 });
        await flush();
        expect(searchApi.totalItems.value).toBe(0);

        seedPage(queryClient, { filters, page: 3, key: ['mine'], totalItems: 42 });
        await flush();
        expect(searchApi.totalItems.value).toBe(42);
    });

    it('a matching page of any page number and size is picked', async () => {
        const { searchApi, queryClient } = await makeApplied();
        seedPage(queryClient, { filters, page: 7, size: 25, totalItems: 77 });
        await flush();

        expect(searchApi.totalItems.value).toBe(77);
    });

    it('a data-less query is never picked, however fresh it claims to be', async () => {
        const { searchApi, queryClient } = await makeApplied();
        const realKey = seedPage(queryClient, {
            filters,
            page: 2,
            totalItems: 50,
            updatedAt: BASE_NOW
        });
        // A page-3 query of the same search with no data yet, but a newer timestamp.
        queryClient
            .getQueryCache()
            .build(queryClient, {
                queryKey: [...realKey.slice(0, 5), 3]
            })
            .setState({ dataUpdatedAt: BASE_NOW + 60_000 });
        await flush();

        expect(searchApi.totalItems.value).toBe(50);
    });
});
