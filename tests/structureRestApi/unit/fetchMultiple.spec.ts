/**
 * UNIT — fetchMultiple: direct contract of the "batch by id" fetch.
 *   - no ids → resolves [] without calling the API
 *   - with a cold cache, requests all ids in one call and stores them
 *   - re-throws on error
 *
 * (Selective staleness — "only fetch expired ids" — is a freshness concern and
 * lives in staleTime/staleTime.multiple.spec.ts.)
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve, apiReject } from '../_helpers/fakeApi';
import { USERS, FULL_USER, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IUser, number>();

describe('UNIT · fetchMultiple', () => {
    it('resolves [] and never calls the API when ids is empty', async () => {
        const c = make();
        const api = apiResolve([USERS[0]]);
        await expect(c.fetchMultiple(api, [])).resolves.toEqual([]);
        expect(api).not.toHaveBeenCalled();
    });

    it('resolves [] and never calls the API when ids is undefined', async () => {
        const c = make();
        const api = apiResolve([USERS[0]]);
        await expect(c.fetchMultiple(api)).resolves.toEqual([]);
        expect(api).not.toHaveBeenCalled();
    });

    it('requests all ids in one call against a cold cache and stores them', async () => {
        const c = make();
        const api = apiResolve([USERS[0], USERS[1]]);
        const result = await c.fetchMultiple(api, [1, 2]);
        expect(api).toHaveBeenCalledTimes(1);
        expect(result).toHaveLength(2);
        expect(c.getRecord(1)).toEqual(USERS[0]);
        expect(c.getRecord(2)).toEqual(USERS[1]);
    });

    it('re-throws on error', async () => {
        const c = make();
        await expect(c.fetchMultiple(apiReject(), [1, 2])).rejects.toThrow('network error');
    });

    it('merge: true preserves fields absent from the fetched response', async () => {
        const c = make();
        await c.fetchTarget(apiResolve(FULL_USER), 1);
        await c.fetchMultiple(apiResolve([{ id: 1, name: 'Alice M' } as IUser]), [1], {
            forced: true,
            merge: true
        });
        expect(c.getRecord(1)).toEqual({ ...FULL_USER, name: 'Alice M' });
    });

    it('default (no merge) replaces the record, dropping fields absent from the response', async () => {
        const c = make();
        await c.fetchTarget(apiResolve(FULL_USER), 1);
        await c.fetchMultiple(apiResolve([{ id: 1, name: 'Alice R' } as IUser]), [1], {
            forced: true
        });
        expect(c.getRecord(1)).toEqual({ id: 1, name: 'Alice R' });
    });

    it('a freshly fetched id is stamped fresh, not re-requested on the next call', async () => {
        const c = make();
        await c.fetchMultiple(apiResolve([USERS[0]]), [1]);

        const api = apiResolve([USERS[0]]);
        await c.fetchMultiple(api, [1]);
        expect(api).not.toHaveBeenCalled(); // still fresh — served from cache, not re-requested
    });
});
