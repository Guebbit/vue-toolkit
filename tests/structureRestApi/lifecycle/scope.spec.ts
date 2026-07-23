/**
 * LIFECYCLE — automatic teardown via the Vue effect scope.
 *
 * The composable wires `destroy()` to `onScopeDispose` when it is created inside an
 * active scope (a component setup, a Pinia setup store, or a bare effectScope). This
 * is what makes it leak-free by default: the consumer never has to remember to call
 * destroy(). These specs prove the auto-wiring actually fires — and that a composable
 * created WITHOUT a scope is left for the caller to tear down manually.
 */

import { effectScope, ref, nextTick, getCurrentScope } from 'vue';
import { useStructureRestApi } from '../../../src/composables/structureRestApi';
import { clearAllInstances, track } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

describe('LIFECYCLE · effect-scope auto-teardown', () => {
    it('stopping the owning scope auto-destroys the composable (records reset, cache cleared)', async () => {
        const scope = effectScope();
        let c!: ReturnType<typeof useStructureRestApi<IUser, number>>;
        scope.run(() => {
            c = track(useStructureRestApi<IUser, number>({ identifiers: 'id' }));
        });

        const first = apiResolve([...USERS]);
        await c.fetchAll(first);
        expect(c.itemList.value.length).toBe(3);

        scope.stop(); // must trigger onScopeDispose -> destroy()

        // records are gone ...
        expect(c.itemList.value).toHaveLength(0);
        // ... and the query cache was cleared, so a later fetch re-hits the API
        const second = apiResolve([...USERS]);
        await c.fetchAll(second);
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('a watchTarget registered in the scope stops firing after the scope is stopped', async () => {
        const scope = effectScope();
        const id = ref<number | undefined>(1);
        const apiCall = jest.fn((i: number) => Promise.resolve(USERS.find((u) => u.id === i)));

        scope.run(() => {
            const c = track(useStructureRestApi<IUser, number>({ identifiers: 'id' }));
            c.watchTarget(id, apiCall);
        });

        await nextTick();
        expect(apiCall).toHaveBeenCalledTimes(1);

        scope.stop(); // disposes the watcher

        id.value = 2;
        await nextTick();
        expect(apiCall).toHaveBeenCalledTimes(1); // no fetch after teardown
    });

    it('created OUTSIDE any scope: nothing is auto-registered, manual destroy() still works', async () => {
        // Guard: this test must genuinely run with no active scope, or it proves nothing
        expect(getCurrentScope()).toBeUndefined();

        const c = track(useStructureRestApi<IUser, number>({ identifiers: 'id' }));
        const first = apiResolve([...USERS]);
        await c.fetchAll(first);
        expect(c.itemList.value.length).toBe(3);

        // No scope existed to auto-dispose it; the caller tears it down explicitly
        c.destroy();
        expect(c.itemList.value).toHaveLength(0);
    });
});
