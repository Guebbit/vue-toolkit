/**
 * internal/settleCallbacks.ts, driven directly against a real QueryClient: a settle served from
 * cache never fires while a fetch of the watched key is running, and `settleIfUnchanged` only
 * acts on the key the watcher already handled.
 */
import { effectScope, ref, type EffectScope } from 'vue';
import { QueryClient } from '@tanstack/vue-query';
import { watchSettled } from '../../src/internal/settleCallbacks';

/** Flushes the microtask `succeed` defers its callbacks through. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

let client: QueryClient;
let scope: EffectScope;

beforeEach(() => {
    client = new QueryClient();
    scope = effectScope();
});

afterEach(() => {
    scope.stop();
    client.clear();
});

/** Watches `key` with `fresh` as the freshness answer; returns the spies and the handle. */
const watch = (key: { value: string[] }, fresh: { value: boolean }) => {
    const onSuccess = jest.fn();
    const onSettled = jest.fn();
    const handle = scope.run(() =>
        watchSettled(
            client,
            {
                queryKey: () => key.value,
                isFresh: () => fresh.value,
                result: () => 'result',
                context: () => 'context'
            },
            { onSuccess, onSettled }
        )
    )!;
    return { onSuccess, onSettled, handle };
};

describe('watchSettled', () => {
    describe('settle from cache', () => {
        it('fires when the key is fresh and nothing is fetching it', async () => {
            const { onSuccess } = watch(ref(['a']), ref(true));
            await flush();
            expect(onSuccess).toHaveBeenCalledWith('result', 'context');
        });

        it('does not fire when the key is not fresh', async () => {
            const { onSuccess } = watch(ref(['a']), ref(false));
            await flush();
            expect(onSuccess).not.toHaveBeenCalled();
        });

        it('does not fire while the watched key is still fetching', async () => {
            // TanStack: a fetch that never resolves keeps `fetchStatus` at 'fetching'.
            // The cancellation `client.clear()` causes on teardown is expected, so it is swallowed.
            client
                .fetchQuery({ queryKey: ['a'], queryFn: () => new Promise(() => {}) })
                .catch(() => {});
            const { onSuccess, onSettled } = watch(ref(['a']), ref(true));
            await flush();
            expect(onSuccess).not.toHaveBeenCalled();
            expect(onSettled).not.toHaveBeenCalled();
        });
    });

    describe('settleIfUnchanged', () => {
        it('settles a re-applied key the watcher already handled', async () => {
            const { onSuccess, handle } = watch(ref(['a']), ref(true));
            await flush();
            onSuccess.mockClear();
            handle.settleIfUnchanged();
            await flush();
            expect(onSuccess).toHaveBeenCalledTimes(1);
        });

        it('does nothing after the key changed and before the watcher handled it', async () => {
            const key = ref(['a']);
            const { onSuccess, handle } = watch(key, ref(true));
            await flush();
            onSuccess.mockClear();
            // Synchronous: the key watcher has not flushed yet, so `handledHash` is stale.
            key.value = ['b'];
            handle.settleIfUnchanged();
            await Promise.resolve();
            expect(onSuccess).not.toHaveBeenCalled();
        });
    });
});
