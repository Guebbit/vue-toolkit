/**
 * Adapters from TanStack's query-function context to what the resource's reads work with.
 *
 * Both keep the abort `signal` behind a getter: TanStack only wires abort-on-cancel once something
 * reads it, so reading it eagerly here would change how an unmounted watcher's fetch is cancelled.
 *
 * @module internal/runningQuery
 */
import type { QueryKey } from '@tanstack/vue-query';
import type { IFetchContext } from '../composables/structureRestApi.js';

/** The query a query function is running for. */
export interface IRunningQuery {
    /** Its key. */
    queryKey: QueryKey;

    /** Its `meta`: what the watcher that built it knew (the raw id, the applied filters). */
    meta: Record<string, unknown> | undefined;

    /** True once TanStack cancelled it: its answer must not be stored. */
    isCancelled: () => boolean;

    /** Aborted by TanStack on cancel. Read lazily — see the module header. */
    readonly signal: AbortSignal;
}

/**
 * The running query of a TanStack query-function context.
 *
 * @param context - the context TanStack passes a query function
 * @param context.queryKey - the running query's key
 * @param context.meta - the running query's meta
 * @param context.signal - aborted by TanStack on cancel
 * @returns the running query
 */
export const runningQueryOf = (context: {
    queryKey: QueryKey;
    meta: Record<string, unknown> | undefined;
    signal: AbortSignal;
}): IRunningQuery => ({
    queryKey: context.queryKey,
    meta: context.meta,
    isCancelled: () => context.signal.aborted,
    get signal() {
        return context.signal;
    }
});

/**
 * The `{ signal }` context a read `apiCall` receives (see IFetchContext), built from a running
 * query or TanStack's own query-function context.
 *
 * @param source - anything exposing a lazy `signal`
 * @returns the context to hand the caller's `apiCall`
 */
export const readContextOf = (source: { signal: AbortSignal }): IFetchContext => ({
    get signal() {
        return source.signal;
    }
});
