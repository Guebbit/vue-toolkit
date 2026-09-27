/**
 * EFFECT STABILITY — `isLoading()` under overlapping requests.
 *
 * `isLoading()` is derived from TanStack's own `isFetching()`/`isMutating()` counts, the only
 * source of truth. The property a subscriber relies on: a burst of concurrent requests produces
 * exactly ONE false->true->false cycle, never a flicker per request. A boolean flag naively
 * toggled per-request would fail this — the first request to resolve would flip it off while
 * others are still in flight.
 */

import { watch, type WatchStopHandle } from 'vue';
import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { deferredApi } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';

/** The sequence watchers of the running test, stopped even when an assertion fails. */
const watchers: WatchStopHandle[] = [];

afterEach(() => {
    for (const stop of watchers.splice(0)) stop();
    clearAllInstances();
});

/** Records every value `isLoading()` transitions THROUGH, synchronously. */
const trackLoading = (c: ReturnType<typeof makeComposable<IUser, number>>) => {
    const seq: boolean[] = [];
    const stop = watch(
        () => c.isLoading(),
        (v) => seq.push(v),
        { flush: 'sync' }
    );
    watchers.push(stop);
    return { seq, stop };
};

describe('EFFECT STABILITY · isLoading under overlapping requests', () => {
    it('shows a single false->true->false cycle for a burst of concurrent requests', async () => {
        const c = makeComposable<IUser, number>();
        const { seq, stop } = trackLoading(c);

        const a = deferredApi<IUser[]>();
        const b = deferredApi<IUser[]>();
        const d = deferredApi<IUser[]>();

        // three overlapping fetches on distinct cache keys (so none dedupe away)
        const p1 = c.fetchAll(a.call, { key: ['A'] });
        const p2 = c.fetchAll(b.call, { key: ['B'] });
        const p3 = c.fetchAll(d.call, { key: ['C'] });

        expect(c.isLoading()).toBe(true); // on from the first start

        // resolve them out of order; isLoading must stay true until the LAST one settles
        a.control.resolve([...USERS]);
        await p1;
        expect(c.isLoading()).toBe(true);

        d.control.resolve([...USERS]);
        await p3;
        expect(c.isLoading()).toBe(true);

        b.control.resolve([...USERS]);
        await p2;
        expect(c.isLoading()).toBe(false); // off only after the last

        expect(seq).toEqual([true, false]); // exactly one cycle — no per-request flicker
        stop();
    });

    it('turns isLoading off even when the request REJECTS', async () => {
        const c = makeComposable<IUser, number>();
        const { seq, stop } = trackLoading(c);
        const { call, control } = deferredApi<IUser[]>();

        const p = c.fetchAll(call, { key: ['A'] });
        expect(c.isLoading()).toBe(true);

        control.reject(new Error('boom'));
        await expect(p).rejects.toThrow('boom');

        expect(c.isLoading()).toBe(false);
        expect(seq).toEqual([true, false]);
        stop();
    });

    it('a mutation and a fetch overlapping both count: isLoading stays true until both settle', async () => {
        const c = makeComposable<IUser, number>();
        const { seq, stop } = trackLoading(c);

        const fetchCall = deferredApi<IUser[]>();
        const mutateCall = deferredApi<{ ok: boolean }>();

        const p1 = c.fetchAll(fetchCall.call, { key: ['A'] });
        const p2 = c.mutateAny(mutateCall.call);
        expect(c.isLoading()).toBe(true);

        fetchCall.control.resolve([...USERS]);
        await p1;
        expect(c.isLoading()).toBe(true); // the mutation is still in flight

        mutateCall.control.resolve({ ok: true });
        await p2;
        expect(c.isLoading()).toBe(false);

        expect(seq).toEqual([true, false]);
        stop();
    });
});
