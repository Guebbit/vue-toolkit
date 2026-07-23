/**
 * EFFECT STABILITY — the `loading` computed under overlapping requests.
 *
 * `loading` is ref-counted (see the _pendingByKey note in the source): the point
 * of the ref-count is that a component bound to `loading` sees exactly ONE
 * false->true->false cycle around a burst of concurrent requests, never a flicker
 * per request. A boolean flag would fail this — the first request to resolve would
 * flip it off while others are still in flight. These specs assert the transition
 * SEQUENCE a subscriber observes, which is the property the ref-count exists for.
 */

import { watch } from 'vue';
import { makeComposable, makeExternalLoading, clearAllInstances } from '../_helpers/harness';
import { deferredApi } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

/** Records every value `loading` transitions THROUGH, synchronously. */
const trackLoading = (loading: { value: boolean }) => {
    const seq: boolean[] = [];
    const stop = watch(loading, (v) => seq.push(v), { flush: 'sync' });
    return { seq, stop };
};

describe('EFFECT STABILITY · loading ref-count', () => {
    it('shows a single false->true->false cycle for a burst of concurrent requests on the same key', async () => {
        const c = makeComposable<IUser, number>();
        const { seq, stop } = trackLoading(c.loading);

        const a = deferredApi<IUser[]>();
        const b = deferredApi<IUser[]>();
        const d = deferredApi<IUser[]>();

        // three overlapping fetches on distinct cache keys (so none dedupe away)
        const p1 = c.fetchAll(a.call, { lastUpdateKey: 'A' });
        const p2 = c.fetchAll(b.call, { lastUpdateKey: 'B' });
        const p3 = c.fetchAll(d.call, { lastUpdateKey: 'C' });

        expect(c.loading.value).toBe(true); // on from the first start

        // resolve them out of order; loading must stay true until the LAST one settles
        a.control.resolve([...USERS]);
        await p1;
        expect(c.loading.value).toBe(true);

        d.control.resolve([...USERS]);
        await p3;
        expect(c.loading.value).toBe(true);

        b.control.resolve([...USERS]);
        await p2;
        expect(c.loading.value).toBe(false); // off only after the last

        expect(seq).toEqual([true, false]); // exactly one cycle — no per-request flicker
        stop();
    });

    it('does not go negative: an unmatched stopLoading cannot switch loading off mid-flight', async () => {
        const c = makeComposable<IUser, number>();
        const { call, control } = deferredApi<IUser[]>();

        const p = c.fetchAll(call, { lastUpdateKey: 'A' });
        expect(c.loading.value).toBe(true);

        // a spurious stop for a key that was never started must be ignored
        c.stopLoading('-nonexistent');
        expect(c.loading.value).toBe(true);

        control.resolve([...USERS]);
        await p;
        expect(c.loading.value).toBe(false);
    });

    it('turns loading off even when the request REJECTS (finally path)', async () => {
        const c = makeComposable<IUser, number>();
        const { seq, stop } = trackLoading(c.loading);
        const { call, control } = deferredApi<IUser[]>();

        const p = c.fetchAll(call, { lastUpdateKey: 'A' });
        expect(c.loading.value).toBe(true);

        control.reject(new Error('boom'));
        await expect(p).rejects.toThrow('boom');

        expect(c.loading.value).toBe(false);
        expect(seq).toEqual([true, false]);
        stop();
    });

    it('an external loading store is told ONLY about the 0->1 and 1->0 edges', async () => {
        const { c, store, loadingKey } = makeExternalLoading<IUser, number>();
        const setEdges: boolean[] = [];
        // wrap the store to record every write it receives
        const originalSet = Object.getOwnPropertyDescriptor(store, loadingKey);
        void originalSet;

        const a = deferredApi<IUser[]>();
        const b = deferredApi<IUser[]>();

        // spy on transitions by sampling the external store around each step
        const p1 = c.fetchAll(a.call, { lastUpdateKey: 'A' });
        setEdges.push(store[loadingKey]); // true after first start
        const p2 = c.fetchAll(b.call, { lastUpdateKey: 'B' });
        setEdges.push(store[loadingKey]); // still true, second start didn't toggle

        a.control.resolve([...USERS]);
        await p1;
        setEdges.push(store[loadingKey]); // still true, one in flight

        b.control.resolve([...USERS]);
        await p2;
        setEdges.push(store[loadingKey]); // false only now

        expect(setEdges).toEqual([true, true, true, false]);
    });
});
