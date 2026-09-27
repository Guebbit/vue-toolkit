/**
 * `onSuccess` / `onError` / `onSettled` for an active, `useQuery`-based watcher.
 *
 * `useQuery` has no per-query callbacks, so they are derived from the query cache. A watcher
 * settles once when a fetch of the query it watches right now lands (a `success` or `error`
 * action on that exact query — a cancelled, paused or superseded fetch never lands), and once
 * when its key switches to data already cached and fresh with no fetch running — that switch
 * runs no fetch at all.
 *
 * @module internal/settleCallbacks
 */
import { getCurrentScope, onScopeDispose, watch } from 'vue';
import { CancelledError, hashKey, type QueryClient } from '@tanstack/vue-query';
import type { IWatchCallbacks } from '../composables/structureRestApi';

/** How a watcher reads what its settles report. */
export interface ISettleReaders<R, C> {
    /** The key the watcher watches right now. */
    queryKey: () => unknown[];

    /** True when the watched key's data is cached, fresh, and the watcher is running. */
    isFresh: () => boolean;

    /** The result a success reports. */
    result: () => R;

    /** The context every callback receives (the watched id, the applied filters). */
    context: () => C;
}

/**
 * Wires a watcher's callbacks. Call inside the watcher's effect scope, so they stop with it.
 *
 * @param queryClient - the client the watched query lives on
 * @param readers - see ISettleReaders
 * @param callbacks - the caller's callbacks
 * @returns `settleIfUnchanged`, for a caller that re-applied the key the watcher already shows
 */
export const watchSettled = <R, C>(
    queryClient: QueryClient,
    readers: ISettleReaders<R, C>,
    callbacks: IWatchCallbacks<R, C>
) => {
    /**
     * TanStack's hash of the watched key: the identity of the query watched right now.
     *
     * @returns the hash
     */
    const watchedHash = (): string => hashKey(readers.queryKey());

    /** The hash the key watcher last handled. */
    let handledHash: string | undefined;

    /** Reports a success. */
    const succeed = (): void => {
        const result = readers.result();
        callbacks.onSuccess?.(result, readers.context());
        callbacks.onSettled?.(result, undefined, readers.context());
    };

    /**
     * Reports a failure.
     *
     * @param error - the failure
     */
    const fail = (error: unknown): void => {
        callbacks.onError?.(error, readers.context());
        callbacks.onSettled?.(undefined, error, readers.context());
    };

    /**
     * Settles a watched key served from cache: fresh, with no fetch running for it.
     */
    const settleCached = (): void => {
        const running = queryClient.getQueryCache().get(watchedHash())?.state.fetchStatus;
        if (running !== 'fetching' && readers.isFresh()) succeed();
    };

    // A fetch of the watched query landed. `manual` successes are writes, not fetches.
    const stop = queryClient.getQueryCache().subscribe((event) => {
        if (event.type !== 'updated' || event.query.queryHash !== watchedHash()) return;
        const { action } = event;
        if (action.type === 'success' && !action.manual) succeed();
        else if (action.type === 'error' && !(action.error instanceof CancelledError))
            fail(action.error);
    });
    if (getCurrentScope()) onScopeDispose(stop);

    // The key switched: settle now if its data is already there and nothing will fetch it.
    watch(
        watchedHash,
        (hash) => {
            handledHash = hash;
            settleCached();
        },
        { immediate: true }
    );

    return {
        /** Settles a re-applied key the key watcher already handled, if served from cache. */
        settleIfUnchanged: (): void => {
            if (watchedHash() === handledHash) settleCached();
        }
    };
};
