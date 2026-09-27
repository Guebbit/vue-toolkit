/**
 * UNIT — perf pin for a merge/partial list write over a large cache (repro N).
 *
 * `editRecord` used to read through `dictionary`, which under the REST layer is a computed that
 * rebuilds its ENTIRE scope from the query cache on every stale read. Each write in a batch
 * invalidated it for the next read, so merging or partially writing a batch of N items over a
 * cache of M records was O(N × M): 1.7s for 1k items over 3k cached, measured before the fix.
 * `IRecordStore.read` (a direct O(1) cache lookup) fixes the asymptotics; this test pins the wall
 * clock so a regression back to the O(N × M) path fails loudly instead of just showing up as
 * "the app feels slower" later. The threshold (1s) sits an order of magnitude under the buggy
 * baseline (1.7s) and comfortably above the fixed path's actual time (tens of ms, low hundreds
 * under CI/dev-machine CPU contention) — tight enough to catch the O(N × M) path returning, loose
 * enough not to flake on a busy machine.
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { buildUsers, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

describe('UNIT · perf — merge over a large cache', () => {
    it('merges 1k items over 3k cached records in well under a second', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchAll(apiResolve(buildUsers(3000)));

        const batch = buildUsers(1000); // ids 1..1000: all already cached, all merged onto
        const start = performance.now();
        await c.fetchAll(apiResolve(batch), { merge: true, key: ['merge-batch'] });
        const elapsed = performance.now() - start;

        expect(elapsed).toBeLessThan(1000);
        expect(c.itemList.value).toHaveLength(3000);
    });
});
