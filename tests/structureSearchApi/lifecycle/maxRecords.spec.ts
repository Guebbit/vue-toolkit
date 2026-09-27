/**
 * LIFECYCLE — maxRecords and searchApi.
 *
 * The page→ids index (searchGet/pageItemList/totalItems) is a read-only VIEW over the same
 * QueryClient the records live in. When a list fetch crosses maxRecords (see
 * tests/structureRestApi/lifecycle/maxRecords.spec.ts), every other query of the current scope
 * is removed — records AND every cached search page. maxRecords is the only bound: there is no
 * separate search index to prune.
 */

import { makeSearchComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../../structureRestApi/_helpers/fakeApi';
import { buildArticles, type IArticle } from '../../structureRestApi/_helpers/fixtures';

afterEach(clearAllInstances);

describe('LIFECYCLE · maxRecords and searchApi', () => {
    it('a maxRecords wipe empties the search view too, since it is the same underlying query cache', async () => {
        const { searchApi } = makeSearchComposable<IArticle, number>({
            maxRecords: 10
        });
        const tech = buildArticles(8, 'tech', 1);
        await searchApi.fetchSearch(
            apiResolve({ items: tech, totalItems: tech.length }),
            { category: 'tech' },
            1
        );
        expect(searchApi.searchGet({ category: 'tech' }, 1)).toHaveLength(8);
        expect(searchApi.pageItemList.value).toHaveLength(8);
        expect(searchApi.totalItems.value).toBe(8);

        // Cross the bound with an unrelated fetch: 8 existing + 5 incoming > 10 → everything of
        // the current scope except the crossing fetchAll's own query is removed, before the
        // incoming batch is written.
        await searchApi.fetchAll(apiResolve(buildArticles(5, 'sport', 100)));

        // The search view is derived from the exact same cache maxRecords just wiped — gone
        // outright, not left dangling.
        expect(searchApi.searchGet({ category: 'tech' }, 1)).toEqual([]);
        expect(searchApi.pageItemList.value).toEqual([]);
        expect(searchApi.totalItems.value).toBe(0);

        // The resource ends up holding only the incoming batch — proof this was a full wipe
        // followed by a fresh write, not a partial/selective prune.
        expect(searchApi.itemList.value).toHaveLength(5);
        expect(searchApi.itemList.value.every((a) => a.category === 'sport')).toBe(true);
    });
});
