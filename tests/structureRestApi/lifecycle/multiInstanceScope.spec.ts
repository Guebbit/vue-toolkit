/**
 * LIFECYCLE — two instances of the same resourceKey under different dependsOn scopes coexist
 * (repro C): a "compare two shops side by side" screen, or a master/detail pair on the same
 * scope where only the detail pane's own dependsOn moves on.
 *
 * Before the live-scope registry (src/internal/scopeRegistry.ts), a resource's start-up sweep
 * dropped every query of the resourceKey under any OTHER scope, on the assumption that nothing
 * still alive could be using it — true for a scope change with no other instance, false the
 * moment a second instance is alive under a different scope. The dependsOn switch's own drop made
 * the same assumption when an instance moved away from a scope a sibling was still showing.
 */

import { ref } from 'vue';
import { runTracked, clearAllInstances, flush, newTestClient } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';
import { useStructureRestApi } from '../../../src/composables/structureRestApi';

afterEach(clearAllInstances);

describe('LIFECYCLE · two instances of the same resourceKey under different scopes', () => {
    it("a second instance's creation sweep does not wipe a live sibling's data under another scope", async () => {
        const queryClient = newTestClient();
        const scopeA = ref('shop-a');
        const a = runTracked(() =>
            useStructureRestApi<IUser, number>({
                resourceKey: 'products',
                dependsOn: () => [scopeA.value],
                queryClient
            })
        );
        await a.fetchTarget(apiResolve(USERS[0]), 1);

        // a second instance, same resourceKey and client, a DIFFERENT scope
        const scopeB = ref('shop-b');
        runTracked(() =>
            useStructureRestApi<IUser, number>({
                resourceKey: 'products',
                dependsOn: () => [scopeB.value],
                queryClient
            })
        );
        await flush();

        expect(a.getRecord(1)).toEqual(USERS[0]);
    });

    it("moving one instance's dependsOn away does not drop a scope a sibling instance still shows", async () => {
        const queryClient = newTestClient();
        const scopeA = ref('shared-shop');
        const a = runTracked(() =>
            useStructureRestApi<IUser, number>({
                resourceKey: 'products',
                dependsOn: () => [scopeA.value],
                queryClient
            })
        );
        const scopeB = ref('shared-shop');
        const b = runTracked(() =>
            useStructureRestApi<IUser, number>({
                resourceKey: 'products',
                dependsOn: () => [scopeB.value],
                queryClient
            })
        );
        await b.fetchTarget(apiResolve(USERS[0]), 1); // both currently on 'shared-shop'

        scopeA.value = 'other-shop'; // a moves on; b is still showing 'shared-shop'
        await flush();

        expect(b.getRecord(1)).toEqual(USERS[0]);
        expect(a.getRecord(1)).toBeUndefined(); // a's own view is scoped to 'other-shop' now
    });

    it('a scope truly nothing claims any more is still dropped once its last instance moves on', async () => {
        const queryClient = newTestClient();
        const scopeA = ref('shared-shop');
        const a = runTracked(() =>
            useStructureRestApi<IUser, number>({
                resourceKey: 'products',
                dependsOn: () => [scopeA.value],
                queryClient
            })
        );
        await a.fetchTarget(apiResolve(USERS[0]), 1);

        scopeA.value = 'other-shop'; // the only instance on 'shared-shop' moves away
        await flush();

        expect(
            queryClient
                .getQueryCache()
                .findAll({ queryKey: ['products', 'target', ['shared-shop'], '1'] })
        ).toHaveLength(0);
    });
});
