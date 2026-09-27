/**
 * INTENTION — fetchSearch seeds the shared per-item target cache, same as every
 * other producer (see tests/structureRestApi/intention/cross-method-cache.spec.ts).
 * fetchSearch runs on the same list-query protocol as fetchAll, which does the actual seeding.
 */

import { makeSearchComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../../structureRestApi/_helpers/fakeApi';
import { buildArticles, type IArticle } from '../../structureRestApi/_helpers/fixtures';

afterEach(clearAllInstances);

describe('INTENTION · cross-method cache seeding (search)', () => {
    it('fetchSearch → fetchTarget(id) is served from cache', async () => {
        const { searchApi } = makeSearchComposable<IArticle, number>();
        const articles = buildArticles(3, 'tech', 1);
        await searchApi.fetchSearch(
            apiResolve({ items: articles, totalItems: articles.length }),
            { category: 'tech' },
            1
        );
        const get = apiResolve(buildArticles(1, 'tech', 1)[0]);
        await searchApi.fetchTarget(get, 1);
        expect(get).not.toHaveBeenCalled();
    });
});
