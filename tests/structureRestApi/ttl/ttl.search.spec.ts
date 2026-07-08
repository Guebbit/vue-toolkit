/**
 * TTL — freshness of fetchSearch / fetchPaginate over time.
 *   - VALID: repeating the same (filters, page, pageSize) just under TTL → cache hit
 *   - STALE: repeating it past TTL → API called again
 *   - the same holds for fetchPaginate (empty filters)
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { buildArticles, buildProducts, type IArticle, type IProduct } from '../_helpers/fixtures';
import { useFakeClock, advance, restoreClock } from '../_helpers/time';

const TTL = 10_000;

beforeEach(() => useFakeClock());
afterEach(() => {
    clearAllInstances();
    restoreClock();
});

describe('TTL · fetchSearch', () => {
    const make = () => makeComposable<IArticle, number>({ TTL });
    const TECH = buildArticles(5, 'tech', 1);

    it('VALID just under TTL → served from cache', async () => {
        const c = make();
        const first = apiResolve(TECH);
        const second = apiResolve(TECH);
        await c.fetchSearch(first, { category: 'tech' }, 1, 10);
        await advance(TTL - 1);
        await c.fetchSearch(second, { category: 'tech' }, 1, 10);
        expect(second).not.toHaveBeenCalled();
    });

    it('STALE past TTL → API called again', async () => {
        const c = make();
        const first = apiResolve(TECH);
        const second = apiResolve(TECH);
        await c.fetchSearch(first, { category: 'tech' }, 1, 10);
        await advance(TTL + 1);
        await c.fetchSearch(second, { category: 'tech' }, 1, 10);
        expect(second).toHaveBeenCalledTimes(1);
    });
});

describe('TTL · fetchPaginate', () => {
    const make = () => makeComposable<IProduct, number>({ TTL });

    it('VALID just under TTL → served from cache', async () => {
        const c = make();
        const first = apiResolve(buildProducts(10, 1));
        const second = apiResolve(buildProducts(10, 1));
        await c.fetchPaginate(first, 1, 10);
        await advance(TTL - 1);
        await c.fetchPaginate(second, 1, 10);
        expect(second).not.toHaveBeenCalled();
    });

    it('STALE past TTL → API called again', async () => {
        const c = make();
        const first = apiResolve(buildProducts(10, 1));
        const second = apiResolve(buildProducts(10, 1));
        await c.fetchPaginate(first, 1, 10);
        await advance(TTL + 1);
        await c.fetchPaginate(second, 1, 10);
        expect(second).toHaveBeenCalledTimes(1);
    });
});
