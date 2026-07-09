/**
 * UNIT — fetchSearch: direct contract of the "search with filters" fetch.
 *   - resolves with matching items and stores them
 *   - records the page→ids mapping (readable via searchGet)
 *   - supports both the plain T[] and the [items, total] tuple response shapes
 *   - handles an empty result set
 *   - re-throws on error without polluting the cache
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve, apiReject } from '../_helpers/fakeApi';
import { buildArticles, type IArticle } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IArticle, number>();
const TECH = buildArticles(5, 'tech', 1);

describe('UNIT · fetchSearch', () => {
    it('resolves with the matching items', async () => {
        const c = make();
        await expect(c.fetchSearch(apiResolve(TECH), { category: 'tech' })).resolves.toHaveLength(
            5
        );
    });

    it('stores the items in the dictionary', async () => {
        const c = make();
        await c.fetchSearch(apiResolve(TECH), { category: 'tech' });
        expect(c.getRecord(1)).toEqual(TECH[0]);
    });

    it('records the page→ids mapping for searchGet', async () => {
        const c = make();
        await c.fetchSearch(apiResolve(TECH), { category: 'tech' }, 1);
        expect(c.searchGet({ category: 'tech' }, 1).map((a) => a.id)).toEqual(
            TECH.map((a) => a.id)
        );
    });

    it('handles an empty result set', async () => {
        const c = make();
        await expect(c.fetchSearch(apiResolve([]), { category: 'none' })).resolves.toEqual([]);
    });

    it('accepts the [items, total] tuple shape and records the total', async () => {
        const c = make();
        const result = await c.fetchSearch(
            apiResolve([TECH, 137] as [IArticle[], number]),
            { category: 'tech' },
            1,
            10
        );
        expect(result).toHaveLength(5);
        expect(c.searchGetTotal({ category: 'tech' }, 10)).toBe(137);
    });

    it('re-throws on error and does not cache the failed page', async () => {
        const c = make();
        await expect(
            c.fetchSearch(apiReject('server error'), { category: 'tech' }, 1)
        ).rejects.toThrow('server error');
        expect(c.searchGet({ category: 'tech' }, 1)).toEqual([]);
    });
});
