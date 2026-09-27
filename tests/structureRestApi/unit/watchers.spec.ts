/**
 * UNIT — the shared contract of the active watchers (watchTarget, watchAll, watchByParent,
 * watchAny): a handle `{ stop, refetch, error }`, failures in `error` rather than a rejection,
 * settle callbacks on a cache hit as well as after a fetch, and no fetch without an id.
 */

import { ref } from 'vue';
import { makeComposable, clearAllInstances, flush } from '../_helpers/harness';
import { apiReject, apiResolve } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

describe('UNIT · watchTarget', () => {
    it('refetch() without an id resolves undefined, calls nothing, caches nothing', async () => {
        const c = makeComposable<IUser, number>();
        const apiCall = jest.fn((id: number) => Promise.resolve({ ...USERS[0], id }));

        // eslint-disable-next-line unicorn/no-null -- a null id is the case under test
        const handle = c.watchTarget(apiCall, ref<number | null>(null));
        await flush();

        await expect(handle.refetch()).resolves.toBeUndefined();
        expect(apiCall).not.toHaveBeenCalled();
        expect(c.itemDictionary.value).toEqual({});
    });

    it('onSuccess fires on a switch to a cached, fresh record — no fetch needed', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(USERS[1]), 2);
        const apiCall = jest.fn((id: number) => Promise.resolve({ ...USERS[0], id }));
        const onSuccess = jest.fn();
        const id = ref(1);

        c.watchTarget(apiCall, id, { onSuccess });
        await flush();
        id.value = 2;
        await flush();

        expect(onSuccess.mock.calls.map(([, calledId]) => calledId)).toEqual([1, 2]);
        expect(apiCall).toHaveBeenCalledTimes(1); // only id 1 was fetched
    });

    it('a failed fetch shows in error and onError, and clears the selection', async () => {
        const c = makeComposable<IUser, number>();
        const onError = jest.fn();

        const handle = c.watchTarget(() => Promise.reject(new Error('boom')), ref(1), {
            onError
        });
        await flush();

        expect(handle.error.value).toBeInstanceOf(Error);
        expect(onError).toHaveBeenCalledTimes(1);
        expect(c.selectedIdentifier.value).toBeUndefined();
    });

    // A throwing onSuccess/onError/onSettled must not reach TanStack's own notify dispatch: that
    // would corrupt the query's own state transition mid-flight. Proven here by the ordering: the
    // callback runs strictly after the cache event that triggered it has fully finished dispatching
    // to every subscriber, never synchronously inside it (settleCallbacks.ts's queueMicrotask).
    it('a settle callback runs after the cache event has finished dispatching, not synchronously inside it', async () => {
        const c = makeComposable<IUser, number>();
        const order: string[] = [];

        c.watchTarget(() => Promise.resolve(USERS[0]), ref(1), {
            onSuccess: () => order.push('onSuccess')
        });
        // Registered after watchTarget's own subscription: within one synchronous dispatch, every
        // subscriber to the same event fires in registration order, so this runs right after
        // settleCallbacks' subscriber returns — before its deferred callback gets a turn.
        const stop = c.queryClient.getQueryCache().subscribe((event) => {
            // manual: the query function's own storeItem write, not the fetch's real success —
            // settleCallbacks ignores it too (see settleCallbacks.ts).
            if (event.type === 'updated' && event.action.type === 'success' && !event.action.manual)
                order.push('cache-event-dispatched');
        });
        await flush();
        stop();

        expect(order).toEqual(['cache-event-dispatched', 'onSuccess']);
    });
});

describe('UNIT · watchAll / watchByParent', () => {
    it('a failed watchAll shows in error; refetch() resolves instead of rejecting', async () => {
        const c = makeComposable<IUser, number>();

        const handle = c.watchAll(apiReject('boom'));
        await flush();

        expect((handle.error.value as Error).message).toBe('boom');
        await expect(handle.refetch()).resolves.toEqual([]);
    });

    it('watchByParent follows a reactive parent id', async () => {
        const c = makeComposable<IUser, number>();
        const parentId = ref<string | number>('team-1');
        const apiCall = jest.fn(() =>
            Promise.resolve(parentId.value === 'team-1' ? [USERS[0]] : [USERS[1]])
        );

        c.watchByParent(apiCall, parentId);
        await flush();
        parentId.value = 'team-2';
        await flush();

        expect(c.getListByParent('team-1')).toEqual([USERS[0]]);
        expect(c.getListByParent('team-2')).toEqual([USERS[1]]);
    });
});

describe('UNIT · watchAny', () => {
    it('two watchers with different keys keep separate answers', async () => {
        const c = makeComposable<IUser, number>();

        const stats = c.watchAny(() => Promise.resolve('stats'), { key: ['stats'] });
        const health = c.watchAny(() => Promise.resolve('health'), { key: ['health'] });
        await flush();

        expect(stats.data.value).toBe('stats');
        expect(health.data.value).toBe('health');
    });
});
