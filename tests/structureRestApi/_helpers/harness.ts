/**
 * Composable factories + instance registry for the structureRestApi suite.
 * Every spec should call `afterEach(clearAllInstances)`: it stops each instance's effect scope
 * (unsubscribing the cache listeners the view/loading counters register via onScopeDispose) and
 * clears its QueryClient, so Jest exits cleanly and instances never leak into the next test.
 * Plain module (not a *.spec.ts) so Jest's testMatch ignores it.
 */

import { createApp, effectScope, type EffectScope } from 'vue';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import {
    useStructureRestApi,
    type IStructureRestApi
} from '../../../src/composables/structureRestApi';

type AnyInstance = { queryClient: QueryClient };

const instances: { instance: AnyInstance; scope: EffectScope }[] = [];

/**
 * Makes the instance's `watch*` methods run inside `scope`. A spec starts watchers after setup,
 * outside any active scope (unlike a component's setup()), so each watcher's own effect scope
 * would have no parent and outlive the test; run inside `scope`, it is a child and stops with it.
 */
function watchInside(instance: AnyInstance, scope: EffectScope): void {
    const methods = instance as unknown as Record<string, unknown>;
    for (const [name, method] of Object.entries(methods))
        if (name.startsWith('watch') && typeof method === 'function')
            methods[name] = (...parameters: unknown[]) =>
                scope.run(() => (method as (...rest: unknown[]) => unknown)(...parameters));
}

/**
 * Register an instance and the effect scope it was built in, so both get torn down together
 * after the test — watchers the test starts later included (see watchInside). Every composable
 * factory in this file already does this for you.
 */
export function track<C extends AnyInstance>(instance: C, scope: EffectScope): C {
    watchInside(instance, scope);
    instances.push({ instance, scope });
    return instance;
}

/**
 * Builds any composable inside its own effect scope and tracks both for cleanup — for the
 * factories the helpers below do not cover (useStructureCrudApi, a custom setup).
 */
export function runTracked<C extends AnyInstance>(factory: () => C): C {
    const scope = effectScope();
    return track(scope.run(factory)!, scope);
}

/** Stops every tracked scope, then clears every tracked QueryClient. */
export function clearAllInstances(): void {
    for (const { instance, scope } of instances.splice(0)) {
        scope.stop();
        instance.queryClient.clear();
    }
}

/**
 * A QueryClient for tests: no retries (a failure fails at once), and always online (Node has no
 * network detection, so TanStack would otherwise pause every call).
 */
export function newTestClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false, networkMode: 'always' },
            mutations: { networkMode: 'always' }
        }
    });
}

/**
 * Lets pending work settle: promise callbacks, Vue's scheduler, and TanStack's batched
 * notifications (scheduled with setTimeout). Several rounds, so a fetch started by a watcher
 * during one round still completes.
 */
export async function flush(rounds = 3): Promise<void> {
    for (let round = 0; round < rounds; round++)
        await new Promise((resolve) => setTimeout(resolve, 0));
}

/** 1 hour — matches the composable's own default, spelled out for specs that read it. */
export const DEFAULT_STALE_TIME = 3_600_000;

/**
 * Default composable: resourceKey 'resource', 1-hour staleTime, its own fresh QueryClient (an
 * explicit one, NOT injection — there's no app/component tree here for `useQueryClient()` to find
 * a provided client through; that path is what `makeInjected` exercises instead), tracked for
 * cleanup. Built inside its own effect scope so the view/loading cache subscriptions (registered
 * via onScopeDispose) actually have a scope to attach to — without one, they'd never be torn down.
 * Pass options to override (e.g. `{ staleTime: 0 }`, `{ resourceKey: 'orders' }`, `{ dependsOn }`).
 */
export function makeComposable<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record-type constraint
    T extends Record<string | number, any> = Record<string, any>,
    K extends string | number = Extract<keyof T, string | number>
>(options: Partial<IStructureRestApi> = {}) {
    const scope = effectScope();
    const instance = scope.run(() =>
        useStructureRestApi<T, K>({
            resourceKey: 'resource',
            staleTime: DEFAULT_STALE_TIME,
            queryClient: newTestClient(),
            ...options
        })
    )!;
    return track(instance, scope);
}

/**
 * Two composables sharing a single QueryClient AND resourceKey, so they share cache buckets.
 * Returns the client, both instances (`a`, `b`) and a `make` factory for additional siblings.
 */
export function makeShared<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record-type constraint
    T extends Record<string | number, any> = Record<string, any>,
    K extends string | number = Extract<keyof T, string | number>
>(resourceKey = 'shared', staleTime = DEFAULT_STALE_TIME) {
    const queryClient = newTestClient();
    const make = () => makeComposable<T, K>({ resourceKey, staleTime, queryClient });
    return { queryClient, make, a: make(), b: make() };
}

/**
 * Runs `factory` (in its own tracked effect scope, see runTracked) with `queryClient` provided
 * through `VueQueryPlugin`, so `useQueryClient()` / `useIsFetching()` find it by injection — the
 * path a component or a Pinia setup store (which runs in `runWithContext` too) gets its client
 * through. The app is never mounted — injection only needs `runWithContext` — so there is no
 * app to unmount; and in Jest's server environment the plugin does not mount the client either.
 */
export function runInjected<C extends AnyInstance>(queryClient: QueryClient, factory: () => C): C {
    const app = createApp({});
    app.use(VueQueryPlugin, { queryClient });
    return app.runWithContext(() => runTracked(factory));
}

/**
 * Builds a composable through `useQueryClient()` injection instead of the `queryClient` option
 * (see runInjected).
 */
export function makeInjected<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record-type constraint
    T extends Record<string | number, any> = Record<string, any>,
    K extends string | number = Extract<keyof T, string | number>
>(queryClient: QueryClient, options: Partial<IStructureRestApi> = {}) {
    return runInjected(queryClient, () =>
        useStructureRestApi<T, K>({
            resourceKey: 'resource',
            staleTime: DEFAULT_STALE_TIME,
            ...options
        })
    );
}
