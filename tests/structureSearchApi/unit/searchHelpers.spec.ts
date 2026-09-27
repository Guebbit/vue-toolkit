/**
 * UNIT — searchGet (pure-ish, cache-adjacent): empty when nothing cached; accepts a filters
 * object or a pre-serialised key.
 *
 * A search page's key embeds its filters as `stableKey(filters)` (order-independent,
 * value-sensitive) — the same canonicalization every other cache key in the toolkit uses; its own
 * properties are covered once, generally, in tests/internal/plainData.property.spec.ts. There is
 * no public `searchKeyGen` any more (V2.7): callers always have the filters object on hand, so
 * `searchGet`/`checkSearch` accept it directly, with the pre-serialised form reachable here only
 * through the internal `stableKey` for the one test that needs it.
 *
 * The page→ids index is a read-only view derived from the cache, so there is nothing to prune
 * or cap by hand; the record bound is covered in lifecycle/maxRecords.spec.ts.
 */

import { makeSearchComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../../structureRestApi/_helpers/fakeApi';
import { buildArticles, type IArticle } from '../../structureRestApi/_helpers/fixtures';
import { stableKey } from '../../../src/internal/plainData';

afterEach(clearAllInstances);

const make = () => makeSearchComposable<IArticle, number>();

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
        expect(searchApi.searchGet(stableKey(filters), 1)).toHaveLength(5);
    });
});
