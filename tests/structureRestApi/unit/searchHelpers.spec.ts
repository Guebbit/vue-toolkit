/**
 * UNIT — search helper functions (pure-ish, cache-adjacent).
 *   - searchKeyGen: stable, order-independent, value/property sensitive
 *   - searchGet: empty when nothing cached; accepts object or pre-serialised key
 *   - searchSetTotal / searchGetTotal: round-trip, scoped by pageSize
 *   - searchCleanup: keeps live entries, prunes orphaned ones
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { buildArticles, type IArticle } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IArticle, number>();

describe('UNIT · searchKeyGen', () => {
    it('is stable for identical objects', () => {
        const c = make();
        expect(c.searchKeyGen({ category: 'tech', page: 1 })).toBe(
            c.searchKeyGen({ category: 'tech', page: 1 })
        );
    });

    it('is independent of property insertion order', () => {
        const c = make();
        expect(c.searchKeyGen({ category: 'tech', status: 'active' })).toBe(
            c.searchKeyGen({ status: 'active', category: 'tech' })
        );
    });

    it('differs for different values', () => {
        const c = make();
        expect(c.searchKeyGen({ category: 'tech' })).not.toBe(
            c.searchKeyGen({ category: 'sport' })
        );
    });

    it('differs for different properties', () => {
        const c = make();
        expect(c.searchKeyGen({ category: 'tech' })).not.toBe(c.searchKeyGen({ tag: 'tech' }));
    });
});

describe('UNIT · searchGet', () => {
    it('returns [] when nothing is cached', () => {
        const c = make();
        expect(c.searchGet({ category: 'missing' }, 1)).toEqual([]);
    });

    it('accepts a pre-serialised string key', async () => {
        const c = make();
        const filters = { category: 'tech' };
        await c.fetchSearch(apiResolve(buildArticles(5, 'tech', 1)), filters, 1);
        expect(c.searchGet(c.searchKeyGen(filters), 1)).toHaveLength(5);
    });
});

describe('UNIT · searchSetTotal / searchGetTotal', () => {
    it('round-trips a manually set total', () => {
        const c = make();
        c.searchSetTotal({ category: 'tech' }, 99, 10);
        expect(c.searchGetTotal({ category: 'tech' }, 10)).toBe(99);
    });

    it('is undefined when never set', () => {
        const c = make();
        expect(c.searchGetTotal({ category: 'tech' }, 10)).toBeUndefined();
    });

    it('is scoped by pageSize', () => {
        const c = make();
        c.searchSetTotal({ category: 'tech' }, 99, 10);
        expect(c.searchGetTotal({ category: 'tech' }, 20)).toBeUndefined();
    });
});

describe('UNIT · searchCleanup', () => {
    it('keeps entries whose backing query is still live', async () => {
        const c = make();
        await c.fetchSearch(apiResolve(buildArticles(3, 'tech', 1)), { category: 'tech' }, 1);
        c.searchCleanup();
        expect(c.searchGet({ category: 'tech' }, 1)).toHaveLength(3);
    });

    it('prunes entries whose backing query has been evicted', async () => {
        const c = make();
        await c.fetchSearch(apiResolve(buildArticles(3, 'tech', 1)), { category: 'tech' }, 1);
        c.queryClient.clear();
        c.searchCleanup();
        expect(c.searchGet({ category: 'tech' }, 1)).toEqual([]);
        expect(Object.keys(c.searchCached.value)).toHaveLength(0);
    });
});
