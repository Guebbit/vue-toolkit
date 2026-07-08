/**
 * PAGINATION — client-side (offline): load everything once, page through it locally.
 * Exercises pageSize / pageCurrent / pageTotal / pageOffset / pageItemList.
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { buildProducts, type IProduct } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IProduct, number>();

describe('PAGINATION · client-side', () => {
    it('pageTotal is 1 when everything fits on one page', async () => {
        const c = make();
        await c.fetchAll(apiResolve(buildProducts(5)));
        c.pageSize.value = 10;
        expect(c.pageTotal.value).toBe(1);
    });

    it('computes the number of pages (ceil)', async () => {
        const c = make();
        await c.fetchAll(apiResolve(buildProducts(25)));
        c.pageSize.value = 10;
        expect(c.pageTotal.value).toBe(3);
    });

    it('returns the first page items', async () => {
        const c = make();
        await c.fetchAll(apiResolve(buildProducts(25)));
        c.pageSize.value = 10;
        c.pageCurrent.value = 1;
        expect(c.pageItemList.value).toHaveLength(10);
        expect(c.pageItemList.value[0]!.id).toBe(1);
    });

    it('returns the second page items', async () => {
        const c = make();
        await c.fetchAll(apiResolve(buildProducts(25)));
        c.pageSize.value = 10;
        c.pageCurrent.value = 2;
        const ids = c.pageItemList.value.map((p) => p.id);
        expect(ids[0]).toBe(11);
        expect(ids.at(-1)).toBe(20);
    });

    it('returns the remaining items on the last page', async () => {
        const c = make();
        await c.fetchAll(apiResolve(buildProducts(25)));
        c.pageSize.value = 10;
        c.pageCurrent.value = 3;
        expect(c.pageItemList.value).toHaveLength(5);
    });

    it('pageItemList is empty when there are no items', () => {
        const c = make();
        c.pageSize.value = 10;
        c.pageCurrent.value = 1;
        expect(c.pageItemList.value).toHaveLength(0);
    });

    it('pageOffset is 0 on page 1 and advances by pageSize', async () => {
        const c = make();
        await c.fetchAll(apiResolve(buildProducts(25)));
        c.pageSize.value = 10;
        c.pageCurrent.value = 1;
        expect(c.pageOffset.value).toBe(0);
        c.pageCurrent.value = 3;
        expect(c.pageOffset.value).toBe(20);
    });

    it('recalculates pages when pageSize changes', async () => {
        const c = make();
        await c.fetchAll(apiResolve(buildProducts(25)));
        c.pageSize.value = 10;
        expect(c.pageTotal.value).toBe(3);
        c.pageSize.value = 5;
        expect(c.pageTotal.value).toBe(5);
    });

    it('navigating every page yields each item exactly once', async () => {
        const products = buildProducts(25);
        const c = make();
        await c.fetchAll(apiResolve(products));
        c.pageSize.value = 10;
        const collected: IProduct[] = [];
        for (let p = 1; p <= c.pageTotal.value; p++) {
            c.pageCurrent.value = p;
            collected.push(...c.pageItemList.value);
        }
        expect(collected.map((i) => i.id).toSorted((a, b) => a - b)).toEqual(
            products.map((p) => p.id)
        );
    });
});
