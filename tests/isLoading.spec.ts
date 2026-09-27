/**
 * useIsLoading: "is any of these resources busy?" across the whole app — a layout-level
 * counterpart to a single resource's own isLoading(key). Matches by resourceKey PREFIX, the
 * same rule useCoreStore's isLoading uses for its own (non-server) flags.
 *
 * Built on useIsFetching/useIsMutating: by default they find the QueryClient through injection,
 * so most tests run inside a Vue app with VueQueryPlugin installed (see the harness's
 * runInjected); the last one passes the client explicitly instead.
 */

import { useStructureRestApi } from '../src/composables/structureRestApi';
import { useIsLoading } from '../src/composables/isLoading';
import {
    clearAllInstances,
    flush,
    newTestClient,
    runInjected,
    runTracked
} from './structureRestApi/_helpers/harness';
import { deferredApi } from './structureRestApi/_helpers/fakeApi';

afterEach(clearAllInstances);

/**
 * One resource per resourceKey, plus useIsLoading(prefixes), all built by injection on one
 * fresh client.
 */
const setup = (resourceKeys: string[], prefixes?: string[]) => {
    const queryClient = newTestClient();
    return runInjected(queryClient, () => ({
        queryClient,
        resources: Object.fromEntries(
            resourceKeys.map((resourceKey) => [resourceKey, useStructureRestApi({ resourceKey })])
        ),
        isLoading: useIsLoading(prefixes)
    }));
};

describe('useIsLoading', () => {
    it('matches by prefix: ["account"] is true while "accountProfile" fetches, false once it settles', async () => {
        const { resources, isLoading } = setup(['accountProfile'], ['account']);

        const { call, control } = deferredApi<Record<string, unknown>[]>();
        const pending = resources.accountProfile.fetchAll(call);
        await flush();
        expect(isLoading.value).toBe(true);

        control.resolve([]);
        await pending;
        await flush();
        expect(isLoading.value).toBe(false);
    });

    it('is false for a resource outside the given prefixes, even while it is fetching', async () => {
        const { resources, isLoading } = setup(['cart'], ['account']);

        const { call, control } = deferredApi<Record<string, unknown>[]>();
        const pending = resources.cart.fetchAll(call);
        await flush();
        expect(isLoading.value).toBe(false); // 'cart' doesn't start with 'account'

        control.resolve([]);
        await pending;
    });

    it('with no prefixes, matches ANY resource sharing the client', async () => {
        const { resources, isLoading } = setup(['cart']);

        const { call, control } = deferredApi<Record<string, unknown>[]>();
        const pending = resources.cart.fetchAll(call);
        await flush();
        expect(isLoading.value).toBe(true);

        control.resolve([]);
        await pending;
    });

    it("also counts a matching resource's mutation", async () => {
        const { resources, isLoading } = setup(['cart'], ['cart']);

        const { call, control } = deferredApi<{ ok: boolean }>();
        const pending = resources.cart.mutateAny(call);
        await flush();
        expect(isLoading.value).toBe(true);

        control.resolve({ ok: true });
        await pending;
        await flush();
        expect(isLoading.value).toBe(false);
    });

    it("does NOT count an unrelated resource's mutation", async () => {
        const { resources, isLoading } = setup(['cart'], ['account']);

        const { call, control } = deferredApi<{ ok: boolean }>();
        const pending = resources.cart.mutateAny(call);
        await flush();
        expect(isLoading.value).toBe(false); // 'cart' doesn't start with 'account'

        control.resolve({ ok: true });
        await pending;
    });

    it('multiple prefixes: matches any resource starting with ONE of them', async () => {
        const { resources, isLoading } = setup(['cart', 'orders'], ['account', 'cart']);

        const cartCall = deferredApi<Record<string, unknown>[]>();
        const cartPending = resources.cart.fetchAll(cartCall.call);
        await flush();
        expect(isLoading.value).toBe(true); // 'cart' is in the prefix list

        cartCall.control.resolve([]);
        await cartPending;
        await flush();
        expect(isLoading.value).toBe(false);

        const ordersCall = deferredApi<Record<string, unknown>[]>();
        const ordersPending = resources.orders.fetchAll(ordersCall.call);
        await flush();
        expect(isLoading.value).toBe(false); // 'orders' is NOT in the prefix list

        ordersCall.control.resolve([]);
        await ordersPending;
    });

    it('skips a query whose first key segment is not a string, while it is in flight', async () => {
        const { queryClient, resources, isLoading } = setup(['cart'], ['cart']);

        // another, non-toolkit part of the app fetching through the SAME client, with a key
        // whose first segment is no resourceKey at all — the prefix test must skip it, not throw
        const foreign = deferredApi<number>();
        const foreignPending = queryClient.fetchQuery({
            queryKey: [{ notAResourceKey: true }],
            queryFn: foreign.call
        });
        await flush();
        expect(isLoading.value).toBe(false);

        // ...and still match the resources it is about, with the foreign query in flight
        const cartCall = deferredApi<Record<string, unknown>[]>();
        const cartPending = resources.cart.fetchAll(cartCall.call);
        await flush();
        expect(isLoading.value).toBe(true);

        cartCall.control.resolve([]);
        foreign.control.resolve(1);
        await Promise.all([cartPending, foreignPending]);
    });

    it('takes the QueryClient explicitly, with no injection context', async () => {
        const queryClient = newTestClient();
        const { cart, isLoading } = runTracked(() => ({
            queryClient,
            cart: useStructureRestApi({ resourceKey: 'cart', queryClient }),
            isLoading: useIsLoading(['cart'], queryClient)
        }));

        const { call, control } = deferredApi<Record<string, unknown>[]>();
        const pending = cart.fetchAll(call);
        await flush();
        expect(isLoading.value).toBe(true);

        control.resolve([]);
        await pending;
        await flush();
        expect(isLoading.value).toBe(false);
    });
});
