/**
 * LIFECYCLE — search pages follow dependsOn (whose data, which language) and resetAll(), like
 * every other query of the resource.
 *
 *   - a dependsOn change re-runs an active watchSearch under the new scope, and the old
 *     scope's page leaves the cache;
 *   - resetAll() drops every search page of the current scope: the view empties and
 *     checkSearch() reports a miss.
 */

import { ref } from 'vue';
import { makeSearchComposable, clearAllInstances, flush } from '../_helpers/harness';
import { apiResolve } from '../../structureRestApi/_helpers/fakeApi';
import { buildArticles, type IArticle } from '../../structureRestApi/_helpers/fixtures';

afterEach(clearAllInstances);

describe('LIFECYCLE · search and dependsOn', () => {
    it('a dependsOn change re-runs an active watchSearch under the new scope', async () => {
        const locale = ref('en');
        const { searchApi } = makeSearchComposable<IArticle, number>({
            dependsOn: () => [locale.value]
        });
        // the answer depends on the scope it is asked under
        const operation = jest.fn(() =>
            Promise.resolve({ items: buildArticles(2, locale.value), totalItems: 2 })
        );
        searchApi.watchSearch(operation);
        await flush();
        expect(searchApi.pageItemList.value.map((a) => a.category)).toEqual(['en', 'en']);

        locale.value = 'fr';
        await flush();

        expect(operation).toHaveBeenCalledTimes(2);
        expect(searchApi.pageItemList.value.map((a) => a.category)).toEqual(['fr', 'fr']);
        expect(searchApi.totalItems.value).toBe(2);
        // the old scope's page left the cache with the switch
        const searchPages = searchApi.queryClient
            .getQueryCache()
            .findAll({ queryKey: ['resource', 'search'] });
        expect(searchPages.map((query) => query.queryKey[2])).toEqual([['fr']]);
    });
});

describe('LIFECYCLE · search and resetAll', () => {
    it('resetAll() drops the search pages: the view empties and checkSearch reports a miss', async () => {
        const { searchApi } = makeSearchComposable<IArticle, number>();
        const tech = buildArticles(3, 'tech', 1);
        await searchApi.fetchSearch(apiResolve({ items: tech, totalItems: 3 }), { c: 'tech' }, 1);
        expect(searchApi.checkSearch({ c: 'tech' }, 1)).toBe(true);

        searchApi.resetAll();

        expect(searchApi.checkSearch({ c: 'tech' }, 1)).toBe(false);
        expect(searchApi.searchGet({ c: 'tech' }, 1)).toEqual([]);
        expect(searchApi.pageItemList.value).toEqual([]);
        expect(searchApi.totalItems.value).toBe(0);
    });
});
