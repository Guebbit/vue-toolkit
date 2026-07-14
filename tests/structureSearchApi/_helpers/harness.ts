/**
 * Composable factory for the structureSearchApi suite: builds a tracked
 * useStructureSearchApi() instance (which owns its own internal restApi) bound
 * to a mutable `filters` ref, so tests can change filters mid-test.
 * Reuses the structureRestApi suite's own tracking (clearAllInstances stops the
 * shared QueryClient's gc timers so Jest exits cleanly).
 * Plain module (not a *.spec.ts) so Jest's testMatch ignores it.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { ref, type Ref } from 'vue';
import { useStructureSearchApi } from '../../../src/composables/structureSearchApi';
import { track } from '../../structureRestApi/_helpers/harness';
import type { IStructureRestApi } from '../../../src/composables/structureRestApi';

export { clearAllInstances, track } from '../../structureRestApi/_helpers/harness';

/**
 * Default composable: tracked for cleanup. Pass `restApiOptions` to override
 * the internal restApi (e.g. `{ TTL: 0 }`), and `initialFilters` to seed the
 * filters ref searchApi is bound to.
 */
export function makeSearchComposable<
    T extends Record<string | number, any> = Record<string, any>,
    K extends string | number = Extract<keyof T, string | number>,
    F = object
>(restApiOptions: IStructureRestApi = {}, initialFilters: F = {} as F) {
    const filters = ref(initialFilters) as Ref<F>;
    const searchApi = track(
        useStructureSearchApi<T, K, string | number, F>(filters, restApiOptions)
    );
    return { searchApi, filters };
}
