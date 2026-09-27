/**
 * LIFECYCLE — what the Vue effect scope a resource is built in owns.
 *
 * The QueryClient is the caller's (passed explicitly, or found through injection — see the
 * harness), so scope disposal never clears it. `onScopeDispose` only unsubscribes the two cache
 * listeners that drive the reactive record/parent view and the `isLoading` counters: stopping
 * the owning scope means "this resource's view stops updating", NOT "its data is wiped". A
 * `watchTarget`/`watchAll`/etc. call's own child scope (nested under whatever scope was active
 * when it was called) stops with it, like a plain `watch()`.
 */

import { effectScope, ref, nextTick, getCurrentScope } from 'vue';
import { useStructureRestApi } from '../../../src/composables/structureRestApi';
import { clearAllInstances, track, newTestClient, DEFAULT_STALE_TIME } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

describe('LIFECYCLE · effect-scope teardown', () => {
    it('stopping the owning scope does NOT clear the shared QueryClient or the records', async () => {
        const queryClient = newTestClient();
        const scope = effectScope();
        let c!: ReturnType<typeof useStructureRestApi<IUser, number>>;
        scope.run(() => {
            c = track(
                useStructureRestApi<IUser, number>({
                    identifiers: 'id',
                    resourceKey: 'resource',
                    staleTime: DEFAULT_STALE_TIME,
                    queryClient
                }),
                scope
            );
        });

        await c.fetchAll(apiResolve([...USERS]));
        expect(c.itemList.value).toHaveLength(3);

        scope.stop();

        // the client is shared and outlives this composable's own scope — nothing here
        // owns it, so nothing here clears it
        expect(queryClient.getQueryData(['resource', 'target', [], '1'])).toEqual({
            data: USERS[0]
        });
    });

    it("after the scope stops, the composable's own view no longer reacts to further cache writes", async () => {
        const queryClient = newTestClient();
        const scope = effectScope();
        let c!: ReturnType<typeof useStructureRestApi<IUser, number>>;
        scope.run(() => {
            c = track(
                useStructureRestApi<IUser, number>({
                    identifiers: 'id',
                    resourceKey: 'resource',
                    staleTime: DEFAULT_STALE_TIME,
                    queryClient
                }),
                scope
            );
        });

        await c.fetchAll(apiResolve([USERS[0]]));
        expect(c.itemList.value).toHaveLength(1);

        scope.stop(); // unsubscribes the QueryCache listener driving the view

        // write a second record DIRECTLY on the shared client, bypassing the composable
        queryClient.setQueryData(['resource', 'target', [], '2'], { data: USERS[1] });

        // the view's subscription is dead: it stays frozen at what it last saw
        expect(c.itemList.value).toHaveLength(1);
    });

    it('a watchTarget registered in the scope stops firing after the scope is stopped', async () => {
        const queryClient = newTestClient();
        const scope = effectScope();
        const id = ref<number | undefined>(1);
        const apiCall = jest.fn((i: number) => Promise.resolve(USERS.find((u) => u.id === i)));

        scope.run(() => {
            const c = track(
                useStructureRestApi<IUser, number>({
                    identifiers: 'id',
                    resourceKey: 'resource',
                    staleTime: DEFAULT_STALE_TIME,
                    queryClient
                }),
                scope
            );
            c.watchTarget(id, apiCall);
        });

        await nextTick();
        expect(apiCall).toHaveBeenCalledTimes(1);

        scope.stop(); // watchTarget's own child scope is nested under this one, and stops with it

        id.value = 2;
        await nextTick();
        expect(apiCall).toHaveBeenCalledTimes(1); // no fetch after teardown
    });

    it('created OUTSIDE any scope: the composable still works — there is no private client to leak', async () => {
        // Guard: this test must genuinely run with no active scope, or it proves nothing
        expect(getCurrentScope()).toBeUndefined();

        const queryClient = newTestClient();
        const c = useStructureRestApi<IUser, number>({
            identifiers: 'id',
            resourceKey: 'resource',
            staleTime: DEFAULT_STALE_TIME,
            queryClient
        });
        // Tracked with an empty scope only so clearAllInstances clears the client afterwards:
        // without a scope of its own, the resource's cache listeners have nothing to stop them.
        track(c, effectScope());
        const first = apiResolve([...USERS]);
        await c.fetchAll(first);
        expect(c.itemList.value.length).toBe(3);

        // There is no private client (the caller owns `queryClient`'s lifetime), and resetAll()
        // is a plain, non-scope-tied call for whoever wants to drop this resource's data.
        c.resetAll();
        expect(c.itemList.value).toHaveLength(0);
        expect(c.checkAll()).toBe(false);
        expect(c.checkTarget(1)).toBe(false);
    });
});
