/**
 * MODIFIER — partial: the search page carries only PARTIAL fields, so it must NOT count as the
 * authoritative per-item value.
 *
 * fetchSearch runs on the same list-query protocol as fetchAll/fetchByParent/fetchPaginate — see
 * tests/structureRestApi/modifiers/partial.spec.ts for the contract this mirrors.
 *
 * With partial:true each item IS merged into its record, but keeps the record's EXISTING
 * freshness instead of being stamped "just fetched". A record new to the cache has no freshness
 * yet, so it stays stale and a later fetchTarget(id) still asks the server.
 */

import { makeSearchComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../../structureRestApi/_helpers/fakeApi';
import { buildArticles, type IArticle } from '../../structureRestApi/_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeSearchComposable<IArticle, number>();

describe('MODIFIER · partial', () => {
    describe('fetchSearch seeding', () => {
        it('default: seeds target cache fresh → later fetchTarget is a cache hit', async () => {
            const { searchApi } = make();
            const tech = buildArticles(2, 'tech', 1);
            await searchApi.fetchSearch(
                apiResolve({ items: tech, totalItems: tech.length }),
                { category: 'tech' },
                1
            );
            const get = apiResolve(buildArticles(1, 'tech', 1)[0]);
            await searchApi.fetchTarget(get, 1);
            expect(get).not.toHaveBeenCalled();
        });

        it('partial: the record reflects the partial value immediately...', async () => {
            const { searchApi } = make();
            const partialItem = { id: 1, title: 'Partial title', category: 'tech' } as IArticle;
            await searchApi.fetchSearch(
                apiResolve({ items: [partialItem], totalItems: 1 }),
                { category: 'tech' },
                1,
                10,
                { partial: true }
            );
            expect(searchApi.getRecord(1)).toEqual(partialItem);
        });

        it('...but a record new to the cache stays stale, so a later fetchTarget still hits the API', async () => {
            const { searchApi } = make();
            const tech = buildArticles(1, 'tech', 1);
            await searchApi.fetchSearch(
                apiResolve({ items: tech, totalItems: tech.length }),
                { category: 'tech' },
                1,
                10,
                { partial: true }
            );
            const get = apiResolve(tech[0]);
            await searchApi.fetchTarget(get, 1);
            expect(get).toHaveBeenCalledTimes(1);
        });
    });
});
