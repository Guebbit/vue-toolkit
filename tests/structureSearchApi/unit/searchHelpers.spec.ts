/**
 * UNIT — search helper functions (pure-ish, cache-adjacent).
 *   - searchKeyGen: stable, order-independent, value/property sensitive
 *   - searchGet: empty when nothing cached; accepts object or pre-serialised key
 *
 * The page→ids index is a read-only view derived from the cache, so there is nothing to prune
 * or cap by hand; the record bound is covered in lifecycle/maxRecords.spec.ts.
 */

import { makeSearchComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../../structureRestApi/_helpers/fakeApi';
import { buildArticles, type IArticle } from '../../structureRestApi/_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeSearchComposable<IArticle, number>();

describe('UNIT · searchKeyGen', () => {
    it('is stable for identical objects', () => {
        const { searchApi } = make();
        expect(searchApi.searchKeyGen({ category: 'tech', page: 1 })).toBe(
            searchApi.searchKeyGen({ category: 'tech', page: 1 })
        );
    });

    it('is independent of property insertion order', () => {
        const { searchApi } = make();
        expect(searchApi.searchKeyGen({ category: 'tech', status: 'active' })).toBe(
            searchApi.searchKeyGen({ status: 'active', category: 'tech' })
        );
    });

    it('differs for different values', () => {
        const { searchApi } = make();
        expect(searchApi.searchKeyGen({ category: 'tech' })).not.toBe(
            searchApi.searchKeyGen({ category: 'sport' })
        );
    });

    it('differs for different properties', () => {
        const { searchApi } = make();
        expect(searchApi.searchKeyGen({ category: 'tech' })).not.toBe(
            searchApi.searchKeyGen({ tag: 'tech' })
        );
    });
});

describe('UNIT · searchGet', () => {
    it('returns [] when nothing is cached', () => {
        const { searchApi } = make();
        expect(searchApi.searchGet({ category: 'missing' }, 1)).toEqual([]);
    });

    it('accepts a pre-serialised string key', async () => {
        const { searchApi } = make();
        const filters = { category: 'tech' };
        const articles = buildArticles(5, 'tech', 1);
        await searchApi.fetchSearch(
            apiResolve({ items: articles, totalItems: articles.length }),
            filters,
            1
        );
        expect(searchApi.searchGet(searchApi.searchKeyGen(filters), 1)).toHaveLength(5);
    });
});
