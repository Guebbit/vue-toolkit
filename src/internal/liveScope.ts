/**
 * The guard every LATE write goes through: an answer may only be stored while some live instance
 * still claims the scope it was asked under (see `scopeRegistry`), and it is stored addressed to
 * that scope (see `forScope`). One helper, so a new write path cannot skip the liveness check.
 *
 * @module internal/liveScope
 */
import type { IQueryRecordStore } from './queryRecordStore.js';
import type { IScopeRegistry } from './scopeRegistry.js';

/**
 * Runs `run` under `scope` when something still claims it; otherwise gives back `fallback`.
 *
 * @param scope - the scope snapshot the write belongs to
 * @param run - the write, run with the store addressing `scope`
 * @param fallback - what the caller gets when the scope is no longer claimed
 */
export type TInLiveScope = <R>(scope: unknown[], run: () => R, fallback: NoInfer<R>) => R;

/**
 * @param store - the record store whose `forScope` addresses the write
 * @param scopeRegistry - tells whether a scope is still claimed
 * @returns the guard
 */
export const createInLiveScope =
    (
        store: Pick<IQueryRecordStore<never, never>, 'forScope'>,
        scopeRegistry: IScopeRegistry
    ): TInLiveScope =>
    (scope, run, fallback) =>
        scopeRegistry.isLive(scope) ? store.forScope(scope, run) : fallback;
