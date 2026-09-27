/**
 * Composable factory for the structureSearchApi suite: builds a tracked
 * useStructureSearchApi() instance (which owns its own internal restApi) bound
 * to a mutable `filters` ref, so tests can change filters mid-test.
 * Reuses the structureRestApi suite's own tracking (clearAllInstances stops each instance's
 * effect scope and clears its QueryClient so Jest exits cleanly).
 * Plain module (not a *.spec.ts) so Jest's testMatch ignores it.
 */

import { effectScope, ref, type Ref } from 'vue';
import { useStructureSearchApi } from '../../../src/composables/structureSearchApi';
import { DEFAULT_STALE_TIME, newTestClient, track } from '../../structureRestApi/_helpers/harness';
import type { IStructureRestApi } from '../../../src/composables/structureRestApi';

export {
    clearAllInstances,
    flush,
    newTestClient,
    runTracked,
    track,
    DEFAULT_STALE_TIME
} from '../../structureRestApi/_helpers/harness';

/**
 * Default composable: resourceKey 'resource', 1-hour staleTime, its own fresh QueryClient (an
 * explicit one, NOT injection — same reasoning as the REST harness's makeComposable: there's no
 * app/component tree here for useQueryClient() to find a provided client through), tracked for
 * cleanup, built inside its own effect scope (the composable's inner restApi registers its cache
 * subscriptions via onScopeDispose — without an active scope they'd never be torn down).
 * Pass `restApiOptions` to override the internal restApi (e.g. `{ staleTime: 0 }`,
 * `{ resourceKey: 'orders' }`), and `initialFilters` to seed the filters ref searchApi is bound to.
 */
export function makeSearchComposable<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record-type constraint
    T extends Record<string | number, any> = Record<string, any>,
    K extends string | number = Extract<keyof T, string | number>,
    F = object
>(restApiOptions: Partial<IStructureRestApi> = {}, initialFilters: F = {} as F) {
    const filters = ref(initialFilters) as Ref<F>;
    const scope = effectScope();
    const searchApi = track(
        scope.run(() =>
            useStructureSearchApi<T, K, string | number, F>(filters, {
                resourceKey: 'resource',
                staleTime: DEFAULT_STALE_TIME,
                queryClient: newTestClient(),
                ...restApiOptions
            })
        )!,
        scope
    );
    return { searchApi, filters };
}
