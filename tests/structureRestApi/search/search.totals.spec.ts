/**
 * SEARCH — server-reported totals.
 *   - plain T[] response leaves the total undefined
 *   - [items, total] tuple records the total (per filters+pageSize)
 *   - searchSetTotal/searchGetTotal round-trip; totals are pageSize-scoped
 *   - a plain-array response does NOT overwrite a manually set total
 *   - a tuple response DOES overwrite a manually set total
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { buildArticles, type IArticle } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IArticle, number>();
const TECH = buildArticles(5, 'tech', 1);
const SPORT = buildArticles(3, 'sport', 100);

describe('SEARCH · totals', () => {
    it('a plain array response leaves the total undefined', async () => {
        const c = make();
        await c.fetchSearch(apiResolve(TECH), { category: 'tech' }, 1, 10);
        expect(c.searchGetTotal({ category: 'tech' }, 10)).toBeUndefined();
    });

    it('a [items, total] tuple records the total', async () => {
        const c = make();
        await c.fetchSearch(
            apiResolve([TECH, 42] as [IArticle[], number]),
            { category: 'tech' },
            1,
            10
        );
        expect(c.searchGetTotal({ category: 'tech' }, 10)).toBe(42);
    });

    it('totals are independent per (filters, pageSize)', async () => {
        const c = make();
        await c.fetchSearch(
            apiResolve([TECH, 42] as [IArticle[], number]),
            { category: 'tech' },
            1,
            10
        );
        await c.fetchSearch(
            apiResolve([SPORT, 7] as [IArticle[], number]),
            { category: 'sport' },
            1,
            10
        );
        expect(c.searchGetTotal({ category: 'tech' }, 10)).toBe(42);
        expect(c.searchGetTotal({ category: 'sport' }, 10)).toBe(7);
    });

    it('searchSetTotal round-trips and is pageSize-scoped', () => {
        const c = make();
        c.searchSetTotal({ category: 'tech' }, 99, 10);
        expect(c.searchGetTotal({ category: 'tech' }, 10)).toBe(99);
        expect(c.searchGetTotal({ category: 'tech' }, 20)).toBeUndefined();
    });

    it('a plain-array response does NOT overwrite a manually set total', async () => {
        const c = make();
        c.searchSetTotal({ category: 'tech' }, 99, 10);
        await c.fetchSearch(apiResolve(TECH), { category: 'tech' }, 1, 10, { forced: true });
        expect(c.searchGetTotal({ category: 'tech' }, 10)).toBe(99);
    });

    it('a tuple response DOES overwrite a manually set total', async () => {
        const c = make();
        c.searchSetTotal({ category: 'tech' }, 99, 10);
        await c.fetchSearch(
            apiResolve([TECH, 5] as [IArticle[], number]),
            { category: 'tech' },
            1,
            10,
            {
                forced: true
            }
        );
        expect(c.searchGetTotal({ category: 'tech' }, 10)).toBe(5);
    });
});
