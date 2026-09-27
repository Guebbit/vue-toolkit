/**
 * staleTime — freshness of fetchSearch over time.
 *   - VALID: repeating the same (filters, page, pageSize) just under staleTime → cache hit
 *   - STALE: repeating it past staleTime → API called again
 */

import { makeSearchComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../../structureRestApi/_helpers/fakeApi';
import { buildArticles, type IArticle } from '../../structureRestApi/_helpers/fixtures';
import { useFakeClock, advance, restoreClock } from '../../structureRestApi/_helpers/time';

const STALE_TIME = 10_000;
const make = () => makeSearchComposable<IArticle, number>({ staleTime: STALE_TIME });

beforeEach(() => useFakeClock());
afterEach(() => {
    clearAllInstances();
    restoreClock();
});

describe('staleTime · fetchSearch', () => {
    const TECH = buildArticles(5, 'tech', 1);

    it('VALID just under staleTime → served from cache', async () => {
        const { searchApi } = make();
        const first = apiResolve({ items: TECH, totalItems: TECH.length });
        const second = apiResolve({ items: TECH, totalItems: TECH.length });
        await searchApi.fetchSearch(first, { category: 'tech' }, 1, 10);
        await advance(STALE_TIME - 1);
        await searchApi.fetchSearch(second, { category: 'tech' }, 1, 10);
        expect(second).not.toHaveBeenCalled();
    });

    it('STALE past staleTime → API called again', async () => {
        const { searchApi } = make();
        const first = apiResolve({ items: TECH, totalItems: TECH.length });
        const second = apiResolve({ items: TECH, totalItems: TECH.length });
        await searchApi.fetchSearch(first, { category: 'tech' }, 1, 10);
        await advance(STALE_TIME + 1);
        await searchApi.fetchSearch(second, { category: 'tech' }, 1, 10);
        expect(second).toHaveBeenCalledTimes(1);
    });
});
