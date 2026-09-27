/**
 * INTENTION — a successful create / update / delete marks the resource's SEARCH pages stale too,
 * like every other list kind: an active watchSearch refetches the page on screen, and a page
 * cached with no watcher is asked for again on its next fetchSearch.
 *
 * (The other list kinds: tests/structureRestApi/intention/list-invalidation.spec.ts.)
 */

import { makeSearchComposable, clearAllInstances, flush } from '../_helpers/harness';
import { apiResolve } from '../../structureRestApi/_helpers/fakeApi';
import { buildArticles, type IArticle } from '../../structureRestApi/_helpers/fixtures';

afterEach(clearAllInstances);

const TECH = buildArticles(3, 'tech', 1);
const NEW_ARTICLE: IArticle = { id: 99, title: 'New', category: 'tech' };

/** A search operation answering the tech page. */
const searchOperation = () =>
    jest.fn(() => Promise.resolve({ items: [...TECH], totalItems: TECH.length }));

type TSearchApi = ReturnType<typeof makeSearchComposable<IArticle, number>>['searchApi'];

const mutations: { name: string; run: (searchApi: TSearchApi) => Promise<unknown> }[] = [
    { name: 'createTarget', run: (searchApi) => searchApi.createTarget(apiResolve(NEW_ARTICLE)) },
    {
        name: 'updateTarget',
        run: (searchApi) =>
            searchApi.updateTarget(
                apiResolve({ ...TECH[0], title: 'Edited' }),
                { title: 'Edited' },
                1
            )
    },
    {
        name: 'deleteTarget',
        run: (searchApi) => searchApi.deleteTarget(apiResolve({ ok: true }), 1)
    }
];

describe.each(mutations)('INTENTION · $name invalidates search pages', ({ run }) => {
    it('an active watchSearch refetches the page on screen', async () => {
        const { searchApi } = makeSearchComposable<IArticle, number>();
        const operation = searchOperation();
        searchApi.watchSearch(operation);
        await flush();
        expect(operation).toHaveBeenCalledTimes(1);

        await run(searchApi);
        await flush();

        expect(operation).toHaveBeenCalledTimes(2);
    });

    it('a cached page with no watcher is stale: the next fetchSearch asks the server', async () => {
        const { searchApi } = makeSearchComposable<IArticle, number>();
        const operation = searchOperation();
        await searchApi.fetchSearch(operation, { category: 'tech' }, 1);
        expect(searchApi.checkSearch({ category: 'tech' }, 1)).toBe(true);

        await run(searchApi);

        expect(searchApi.checkSearch({ category: 'tech' }, 1)).toBe(false);
        await searchApi.fetchSearch(operation, { category: 'tech' }, 1);
        expect(operation).toHaveBeenCalledTimes(2);
    });
});
