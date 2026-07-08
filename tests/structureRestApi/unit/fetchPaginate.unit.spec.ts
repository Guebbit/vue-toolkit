/**
 * UNIT — fetchPaginate: direct contract of "server pagination without filters".
 * It delegates to fetchSearch with empty filters, so:
 *   - resolves with the page items and stores them
 *   - the page is retrievable via searchGet({})
 *   - the [items, total] tuple total is retrievable via searchGetTotal({})
 *   - an empty page resolves cleanly
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { buildProducts, type IProduct } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IProduct, number>();

describe('UNIT · fetchPaginate', () => {
    it('resolves with the page items', async () => {
        const c = make();
        await expect(c.fetchPaginate(apiResolve(buildProducts(10, 1)), 1, 10)).resolves.toHaveLength(
            10
        );
    });

    it('stores the returned items', async () => {
        const c = make();
        await c.fetchPaginate(apiResolve(buildProducts(10, 1)), 1, 10);
        expect(c.getRecord(1)).toBeDefined();
        expect(c.getRecord(10)).toBeDefined();
    });

    it('exposes the page through searchGet with empty filters', async () => {
        const c = make();
        await c.fetchPaginate(apiResolve(buildProducts(10, 1)), 1, 10);
        const page = c.searchGet({}, 1, 10);
        expect(page).toHaveLength(10);
        expect(page[0]?.id).toBe(1);
    });

    it('records the tuple total under empty filters', async () => {
        const c = make();
        await c.fetchPaginate(apiResolve([buildProducts(10, 1), 250] as [IProduct[], number]), 1, 10);
        expect(c.searchGetTotal({}, 10)).toBe(250);
    });

    it('resolves an empty page cleanly', async () => {
        const c = make();
        await expect(c.fetchPaginate(apiResolve([]), 1, 10)).resolves.toEqual([]);
    });
});
