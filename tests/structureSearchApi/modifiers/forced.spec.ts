/**
 * MODIFIER — forced: bypass a still-fresh cache entry and re-hit the API. On a watchSearch,
 * nothing cached counts as fresh: what search() resolves is the server's answer.
 */

import { makeSearchComposable, clearAllInstances, flush } from '../_helpers/harness';
import { apiResolve } from '../../structureRestApi/_helpers/fakeApi';
import { buildArticles, type IArticle } from '../../structureRestApi/_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeSearchComposable<IArticle, number>();

describe('MODIFIER · forced', () => {
    it('fetchSearch: forced re-hits the API', async () => {
        const { searchApi } = make();
        const tech = buildArticles(5, 'tech', 1);
        const first = apiResolve({ items: tech, totalItems: tech.length });
        const second = apiResolve({ items: tech, totalItems: tech.length });
        await searchApi.fetchSearch(first, { category: 'tech' }, 1);
        await searchApi.fetchSearch(second, { category: 'tech' }, 1, 10, { forced: true });
        expect(second).toHaveBeenCalledTimes(1);
    });

    // Known bug: structureSearchApi.ts isCurrentFresh: spreads `{ ...searchSettings, forced }`, so
    // search()'s own `forced = false` overrides the watcher's `forced` and the stale cache counts
    // as fresh.
    it.failing(
        "watchSearch: forced, search() back to a cached search resolves the server's new answer",
        async () => {
            const { searchApi, filters } = makeSearchComposable<
                IArticle,
                number,
                { category?: string }
            >({}, { category: 'tech' });
            let answers = 0;
            /** Every answer is a distinct article, titled by its order. */
            const operation = jest.fn((current: { category?: string }) => {
                answers += 1;
                return Promise.resolve({
                    items: [
                        { id: answers, title: `answer ${answers}`, category: current.category! }
                    ],
                    totalItems: 1
                });
            });
            const { search } = searchApi.watchSearch(operation, { forced: true });
            await flush();
            filters.value = { category: 'design' };
            await search();
            filters.value = { category: 'tech' }; // cached, from the first answer

            const result = await search();

            expect(operation).toHaveBeenCalledTimes(3);
            expect(result?.items.map((item) => item?.title)).toEqual(['answer 3']);
        }
    );
});
