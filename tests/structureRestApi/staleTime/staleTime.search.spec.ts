/**
 * staleTime — freshness of fetchPaginate over time.
 *   - VALID: repeating the same (page, pageSize) just under staleTime → cache hit
 *   - STALE: repeating it past staleTime → API called again
 *
 * (fetchSearch's staleTime behaviour lives in tests/structureSearchApi/staleTime/staleTime.search.spec.ts)
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { buildProducts, type IProduct } from '../_helpers/fixtures';
import { useFakeClock, advance, restoreClock } from '../_helpers/time';

const STALE_TIME = 10_000;
const makeProducts = () => makeComposable<IProduct, number>({ staleTime: STALE_TIME });

beforeEach(() => useFakeClock());
afterEach(() => {
    clearAllInstances();
    restoreClock();
});

describe('staleTime · fetchPaginate', () => {
    it('VALID just under staleTime → served from cache', async () => {
        const c = makeProducts();
        const first = apiResolve(buildProducts(10, 1));
        const second = apiResolve(buildProducts(10, 1));
        await c.fetchPaginate(first, 1, 10);
        await advance(STALE_TIME - 1);
        await c.fetchPaginate(second, 1, 10);
        expect(second).not.toHaveBeenCalled();
    });

    it('STALE past staleTime → API called again', async () => {
        const c = makeProducts();
        const first = apiResolve(buildProducts(10, 1));
        const second = apiResolve(buildProducts(10, 1));
        await c.fetchPaginate(first, 1, 10);
        await advance(STALE_TIME + 1);
        await c.fetchPaginate(second, 1, 10);
        expect(second).toHaveBeenCalledTimes(1);
    });
});
