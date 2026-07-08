/**
 * PAGINATION — fetchPaginate (server pagination without filters).
 * Delegates to fetchSearch with empty filters, so each (page, pageSize) is its
 * own cache bucket, totals come from the tuple shape, and searchGet({}) reads back.
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { buildProducts, type IProduct } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IProduct, number>();

describe('PAGINATION · fetchPaginate', () => {
    it('caches page 1 and page 2 independently', async () => {
        const c = make();
        const p1 = apiResolve(buildProducts(10, 1));
        const p2 = apiResolve(buildProducts(10, 11));
        await c.fetchPaginate(p1, 1, 10);
        await c.fetchPaginate(p2, 2, 10);
        expect(p1).toHaveBeenCalledTimes(1);
        expect(p2).toHaveBeenCalledTimes(1);
    });

    it('does not re-fetch the same page within TTL', async () => {
        const c = make();
        const first = apiResolve(buildProducts(10, 1));
        const second = apiResolve(buildProducts(10, 1));
        await c.fetchPaginate(first, 1, 10);
        await c.fetchPaginate(second, 1, 10);
        expect(second).not.toHaveBeenCalled();
    });

    it('forced bypasses the cache', async () => {
        const c = make();
        const first = apiResolve(buildProducts(10, 1));
        const second = apiResolve(buildProducts(10, 1));
        await c.fetchPaginate(first, 1, 10);
        await c.fetchPaginate(second, 1, 10, { forced: true });
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('different pageSizes are separate buckets', async () => {
        const c = make();
        const size10 = apiResolve(buildProducts(10, 1));
        const size20 = apiResolve(buildProducts(20, 1));
        await c.fetchPaginate(size10, 1, 10);
        await c.fetchPaginate(size20, 1, 20);
        expect(size10).toHaveBeenCalledTimes(1);
        expect(size20).toHaveBeenCalledTimes(1);
    });

    it('records the tuple total under empty filters', async () => {
        const c = make();
        await c.fetchPaginate(apiResolve([buildProducts(10, 1), 150] as [IProduct[], number]), 1, 10);
        expect(c.searchGetTotal({}, 10)).toBe(150);
    });

    it('exposes the page via searchGet with empty filters', async () => {
        const c = make();
        await c.fetchPaginate(apiResolve(buildProducts(10, 1)), 1, 10);
        const page = c.searchGet({}, 1, 10);
        expect(page).toHaveLength(10);
        expect(page[0]?.id).toBe(1);
    });

    it('accumulates items from multiple pages in the dictionary', async () => {
        const c = make();
        await c.fetchPaginate(apiResolve(buildProducts(10, 1)), 1, 10);
        await c.fetchPaginate(apiResolve(buildProducts(10, 11)), 2, 10);
        expect(c.itemList.value).toHaveLength(20);
    });
});
