/**
 * staleTime — checkSearch must agree with fetchSearch about the stale boundary:
 *   - VALID: just UNDER the staleTime → check reports true (fetchSearch would reuse the cache)
 *   - STALE: just PAST the staleTime → check reports false (fetchSearch would hit the network)
 */

import { makeSearchComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../../structureRestApi/_helpers/fakeApi';
import { type IUser } from '../../structureRestApi/_helpers/fixtures';
import { useFakeClock, advance, restoreClock } from '../../structureRestApi/_helpers/time';

const STALE_TIME = 10_000;
const make = (staleTime = STALE_TIME) => makeSearchComposable<IUser, number>({ staleTime });

beforeEach(() => useFakeClock());
afterEach(() => {
    clearAllInstances();
    restoreClock();
});

describe('staleTime · checkSearch', () => {
    it('VALID just under staleTime → true', async () => {
        const { searchApi } = make();
        await searchApi.fetchSearch(
            apiResolve({ items: [{ id: 1 } as IUser], totalItems: 1 }),
            { role: 'admin' },
            1,
            10
        );
        await advance(STALE_TIME - 1);
        expect(searchApi.checkSearch({ role: 'admin' }, 1, 10)).toBe(true);
    });

    it('STALE past staleTime → false', async () => {
        const { searchApi } = make();
        await searchApi.fetchSearch(
            apiResolve({ items: [{ id: 1 } as IUser], totalItems: 1 }),
            { role: 'admin' },
            1,
            10
        );
        await advance(STALE_TIME + 1);
        expect(searchApi.checkSearch({ role: 'admin' }, 1, 10)).toBe(false);
    });
});
