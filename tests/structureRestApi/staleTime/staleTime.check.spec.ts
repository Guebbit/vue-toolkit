/**
 * staleTime — the pre-flight checks (checkTarget/checkAll/checkByParent/checkMultiple)
 * must agree with their fetch* counterpart about the stale boundary:
 *   - VALID: just UNDER the staleTime → check reports true (fetch* would reuse the cache)
 *   - STALE: just PAST the staleTime → check reports false (fetch* would hit the network)
 * Plus the per-call staleTime override, same as staleTime.get.spec.ts.
 *
 * (checkSearch's staleTime behaviour lives in tests/structureSearchApi/staleTime/staleTime.check.spec.ts)
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { USERS, buildUsers, type IUser } from '../_helpers/fixtures';
import { useFakeClock, advance, restoreClock } from '../_helpers/time';

const STALE_TIME = 10_000;
const make = (staleTime = STALE_TIME) => makeComposable<IUser, number>({ staleTime });

beforeEach(() => useFakeClock());
afterEach(() => {
    clearAllInstances();
    restoreClock();
});

describe('staleTime · checkTarget', () => {
    it('VALID just under staleTime → true', async () => {
        const c = make();
        await c.fetchTarget(apiResolve(USERS[0]), 1);
        await advance(STALE_TIME - 1);
        expect(c.checkTarget(1)).toBe(true);
    });

    it('STALE past staleTime → false', async () => {
        const c = make();
        await c.fetchTarget(apiResolve(USERS[0]), 1);
        await advance(STALE_TIME + 1);
        expect(c.checkTarget(1)).toBe(false);
    });
});

describe('staleTime · checkAll', () => {
    it('VALID just under staleTime → true', async () => {
        const c = make();
        await c.fetchAll(apiResolve([...USERS]));
        await advance(STALE_TIME - 1);
        expect(c.checkAll()).toBe(true);
    });

    it('STALE past staleTime → false', async () => {
        const c = make();
        await c.fetchAll(apiResolve([...USERS]));
        await advance(STALE_TIME + 1);
        expect(c.checkAll()).toBe(false);
    });
});

describe('staleTime · checkByParent', () => {
    it('VALID just under staleTime → true', async () => {
        const c = make();
        await c.fetchByParent(apiResolve(buildUsers(3, 1)), 'team-1');
        await advance(STALE_TIME - 1);
        expect(c.checkByParent('team-1')).toBe(true);
    });

    it('STALE past staleTime → false', async () => {
        const c = make();
        await c.fetchByParent(apiResolve(buildUsers(3, 1)), 'team-1');
        await advance(STALE_TIME + 1);
        expect(c.checkByParent('team-1')).toBe(false);
    });
});

describe('staleTime · checkMultiple', () => {
    it('MIXED: id primed early is stale, id primed late is still fresh', async () => {
        const c = make();
        await c.fetchTarget(apiResolve(USERS[0]), 1); // primed at t0
        await advance(6000);
        await c.fetchTarget(apiResolve(USERS[1]), 2); // primed at t6000
        await advance(6000); // now t12000: id1 age 12000 (stale), id2 age 6000 (fresh)

        expect(c.checkMultiple([1, 2])).toEqual({ cachedIds: [2], expiredIds: [1] });
    });
});

describe('staleTime · check per-call override', () => {
    it('a SHORT per-call staleTime makes checkAll report stale sooner than the composable staleTime', async () => {
        const c = make(3_600_000); // composable: 1 hour
        await c.fetchAll(apiResolve([...USERS]), { staleTime: 5000 });
        await advance(5001);
        expect(c.checkAll({ staleTime: 5000 })).toBe(false);
    });

    it('a LONG per-call staleTime keeps checkAll true past the composable staleTime', async () => {
        const c = make(1000); // composable: 1 second
        await c.fetchAll(apiResolve([...USERS]), { staleTime: 60_000 });
        await advance(30_000);
        expect(c.checkAll({ staleTime: 60_000 })).toBe(true);
    });
});
