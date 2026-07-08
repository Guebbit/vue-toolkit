/**
 * Composable factories + instance registry for the structureRestApi suite.
 * Every spec should call `afterEach(clearAllInstances)` to stop TanStack's gc
 * timers so Jest exits cleanly.
 * Plain module (not a *.spec.ts) so Jest's testMatch ignores it.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { QueryClient } from '@tanstack/query-core';
import {
    useStructureRestApi,
    type IStructureRestApi
} from '../../../src/composables/structureRestApi';

type AnyInstance = { queryClient: QueryClient };

const instances: AnyInstance[] = [];

/** Register an instance so its QueryClient gets cleared after the test. */
export function track<C extends AnyInstance>(instance: C): C {
    instances.push(instance);
    return instance;
}

/** Clear every tracked QueryClient (call in afterEach). */
export function clearAllInstances(): void {
    for (const instance of instances.splice(0)) instance.queryClient.clear();
}

/**
 * Default composable: identifiers 'id', 1-hour TTL, tracked for cleanup.
 * Pass options to override (e.g. `{ TTL: 0 }`, `{ loadingKey }`, `{ queryClient }`).
 */
export function makeComposable<
    T extends Record<string | number, any> = Record<string, any>,
    K extends string | number = Extract<keyof T, string | number>
>(options: IStructureRestApi = {}) {
    return track(useStructureRestApi<T, K>({ identifiers: 'id', TTL: 3_600_000, ...options }));
}

/**
 * Composable wired to an EXTERNAL loading store (getLoading/setLoading), the way
 * a consumer integrates a global loading manager. Returns the composable plus
 * the backing `store` so specs can assert per-key loading state.
 */
export function makeExternalLoading<
    T extends Record<string | number, any> = Record<string, any>,
    K extends string | number = Extract<keyof T, string | number>
>(loadingKey = 'resource', options: IStructureRestApi = {}) {
    const store: Record<string, boolean> = {};
    const c = makeComposable<T, K>({
        loadingKey,
        getLoading: (k?: string) => !!(k && store[k]),
        setLoading: (k?: string, v?: boolean) => {
            if (k) store[k] = !!v;
        },
        ...options
    });
    return { c, store, loadingKey };
}

/**
 * Two composables sharing a single QueryClient AND loadingKey, so they share
 * cache buckets. Returns the client, both instances (`a`, `b`) and a `make`
 * factory for additional siblings.
 */
export function makeShared<
    T extends Record<string | number, any> = Record<string, any>,
    K extends string | number = Extract<keyof T, string | number>
>(loadingKey = 'shared', TTL = 3_600_000) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                gcTime: Math.max(TTL, 5 * 60 * 1000),
                networkMode: 'always'
            }
        }
    });
    const make = () => makeComposable<T, K>({ loadingKey, TTL, queryClient });
    return { queryClient, make, a: make(), b: make() };
}
