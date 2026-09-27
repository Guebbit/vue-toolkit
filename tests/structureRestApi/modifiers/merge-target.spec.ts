/**
 * MODIFIER — merge on a record's own query (fetchTarget / watchTarget).
 *
 * The query function writes the merged record, then TanStack writes the query's resolved value
 * back under the same key. The resolved value must therefore be the merged record: resolving
 * with the raw response would silently undo the merge. Only visible when the response LACKS
 * fields the stored record has — a response that is a superset looks the same either way.
 */

import { ref } from 'vue';
import { makeComposable, clearAllInstances, flush } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { FULL_USER, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const PARTIAL_RESPONSE = { id: 1, name: 'Alice M' } as IUser;

describe('MODIFIER · merge on a record query', () => {
    it('fetchTarget keeps the fields the response lacks', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(FULL_USER), 1);

        const result = await c.fetchTarget(apiResolve(PARTIAL_RESPONSE), 1, {
            merge: true,
            forced: true
        });

        expect(c.getRecord(1)).toEqual({ ...FULL_USER, name: 'Alice M' });
        expect(result).toEqual({ ...FULL_USER, name: 'Alice M' });
    });

    it('watchTarget keeps the fields the response lacks', async () => {
        const c = makeComposable<IUser, number>();
        c.addRecord(FULL_USER);

        c.watchTarget(ref(1), () => Promise.resolve(PARTIAL_RESPONSE), { merge: true });
        await flush();

        expect(c.getRecord(1)).toEqual({ ...FULL_USER, name: 'Alice M' });
    });

    it('without merge, the response replaces the record', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(FULL_USER), 1);

        await c.fetchTarget(apiResolve(PARTIAL_RESPONSE), 1, { forced: true });

        expect(c.getRecord(1)).toEqual(PARTIAL_RESPONSE);
    });
});
