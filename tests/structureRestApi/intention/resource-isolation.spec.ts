/**
 * INTENTION — two resources sharing one QueryClient (the whole point of "one shared
 * cache per app") stay isolated from each other. Every mechanism of a resource
 * that scopes itself to `resourceKey` needs this proven, not just "the resource sees its
 * own data" — a query-cache SUBSCRIPTION or a `findAll` scan that forgot to filter by
 * resourceKey would still pass every single-resource test, since there'd be nothing else
 * in the client to leak from. Two resources with the SAME (default, empty-array) dependsOn
 * is the sharpest version of this: nothing but resourceKey itself tells them apart.
 */

import { ref } from 'vue';
import { makeComposable, clearAllInstances, flush, newTestClient } from '../_helpers/harness';
import { deferredApi } from '../_helpers/fakeApi';
import { USERS, buildProducts, type IUser, type IProduct } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const makeTwo = () => {
    const queryClient = newTestClient();
    const users = makeComposable<IUser, number>({ resourceKey: 'users', queryClient });
    const products = makeComposable<IProduct, number>({ resourceKey: 'products', queryClient });
    return { users, products, queryClient };
};

describe('INTENTION · two resources sharing one client stay isolated', () => {
    it("the view: one resource's records never appear in the other's dictionary", async () => {
        const { users, products } = makeTwo();
        await users.fetchAll(() => Promise.resolve([...USERS]));
        await products.fetchAll(() => Promise.resolve(buildProducts(2)));

        expect(users.itemList.value).toHaveLength(3);
        expect(products.itemList.value).toHaveLength(2);
        expect(users.getRecord(1)).toEqual(USERS[0]);
        // a product id colliding with a user id must not resolve through the wrong resource
        expect(products.getRecord(1)).not.toEqual(USERS[0]);
    });

    it("parentHasMany: one resource's parent/child links never appear in the other's", async () => {
        const { users, products } = makeTwo();
        await users.fetchByParent(() => Promise.resolve([USERS[0]]), 'team-1');
        await products.fetchByParent(() => Promise.resolve(buildProducts(1)), 'team-1');

        expect(users.getListByParent('team-1')).toHaveLength(1);
        expect(products.getListByParent('team-1')).toHaveLength(1);
        expect(users.getListByParent('team-1')[0]).toEqual(USERS[0]);
    });

    it("isLoading(): one resource's in-flight fetch never makes the other report loading", async () => {
        const { users, products } = makeTwo();
        const { call, control } = deferredApi<IUser[]>();

        const pending = users.fetchAll(call);
        expect(users.isLoading()).toBe(true);
        expect(products.isLoading()).toBe(false); // the other resource is untouched

        control.resolve([...USERS]);
        await pending;
        expect(users.isLoading()).toBe(false);
    });

    it("isLoading(): one resource's in-flight MUTATION never makes the other report loading", async () => {
        const { users, products } = makeTwo();
        const { call, control } = deferredApi<{ ok: boolean }>();

        const pending = users.mutateAny(call);
        expect(users.isLoading()).toBe(true);
        expect(products.isLoading()).toBe(false);

        control.resolve({ ok: true });
        await pending;
    });

    it("createTarget invalidating this resource's lists does not refetch the other resource's active list", async () => {
        const { users, products } = makeTwo();
        const usersList = jest.fn(() => Promise.resolve([...USERS]));
        const productsList = jest.fn(() => Promise.resolve(buildProducts(2)));

        const usersWatch = users.watchAll(usersList);
        const productsWatch = products.watchAll(productsList);
        await flush();
        expect(usersList).toHaveBeenCalledTimes(1);
        expect(productsList).toHaveBeenCalledTimes(1);

        await users.createTarget(() => Promise.resolve({ id: 4, name: 'Dave', email: 'd@e.com' }));
        await flush();

        expect(usersList).toHaveBeenCalledTimes(2); // users' own list refetched
        expect(productsList).toHaveBeenCalledTimes(1); // products' list untouched
        usersWatch.stop();
        productsWatch.stop();
    });

    it("resetAll() on one resource does not touch the other resource's records", async () => {
        const { users, products } = makeTwo();
        await users.fetchAll(() => Promise.resolve([...USERS]));
        await products.fetchAll(() => Promise.resolve(buildProducts(2)));

        users.resetAll();

        expect(users.itemList.value).toHaveLength(0);
        expect(users.checkAll()).toBe(false); // the list entry went too, not just the records
        expect(products.itemList.value).toHaveLength(2);
        expect(products.checkAll()).toBe(true);
    });

    it("a dependsOn change on one resource does not tear down the other resource's queries", async () => {
        const queryClient = newTestClient();
        const userId = ref('alice');
        const users = makeComposable<IUser, number>({
            resourceKey: 'users',
            queryClient,
            dependsOn: () => [userId.value]
        });
        // products has NO dependsOn of its own (default () => []) — a different resource
        // entirely, sharing only the client, whose own dependsOn value never changes
        const products = makeComposable<IProduct, number>({ resourceKey: 'products', queryClient });

        await users.fetchAll(() => Promise.resolve([...USERS]));
        await products.fetchAll(() => Promise.resolve(buildProducts(2)));

        userId.value = 'bob';
        await flush();

        // users' own data left with the dependsOn switch, as expected...
        expect(users.itemList.value).toHaveLength(0);
        // ...but products, sharing only the client, must be completely unaffected
        expect(products.itemList.value).toHaveLength(2);
    });

    it('a dependsOn change on one resource spares another resource whose OWN dependsOn coincidentally equals the OLD value', async () => {
        // The teardown predicate must require BOTH `resourceKey` AND the dependsOn match —
        // requiring only the dependsOn half would tear down any other resource that just
        // happens to be scoped to the same value users started at, even though its resourceKey
        // never matches. Non-colliding values (the test above) can't tell these apart, since
        // neither clause is true for `products` there either way.
        const queryClient = newTestClient();
        const userId = ref('alice');
        const users = makeComposable<IUser, number>({
            resourceKey: 'users',
            queryClient,
            dependsOn: () => [userId.value]
        });
        // products is pinned to 'alice' too — colliding with users' STARTING dependsOn value —
        // but is a completely different resourceKey.
        const products = makeComposable<IProduct, number>({
            resourceKey: 'products',
            queryClient,
            dependsOn: () => ['alice']
        });

        await users.fetchAll(() => Promise.resolve([...USERS]));
        await products.fetchAll(() => Promise.resolve(buildProducts(2)));

        userId.value = 'bob';
        await flush();

        expect(users.itemList.value).toHaveLength(0);
        // products' dependsOn value ('alice') equals users' OLD value, but its resourceKey
        // doesn't — it must survive the teardown untouched.
        expect(products.itemList.value).toHaveLength(2);
    });
});
