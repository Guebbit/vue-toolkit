/**
 * UNIT · internal/parentRelations.ts: the relation store is a view over the parent list entries
 * of one scope. Pins down which buckets an edit touches and that linking is idempotent.
 */
import { ref } from 'vue';
import { QueryClient } from '@tanstack/vue-query';
import { createQueryRelationStore } from '../../src/internal/parentRelations';
import { createResourceKeys, type IListCacheEntry } from '../../src/internal/resourceKeys';

/**
 * A relation store on a fresh client, a movable scope, and the seams to write and read buckets.
 *
 * @returns the store plus helpers
 */
const build = () => {
    const queryClient = new QueryClient();
    const scope = ref<unknown[]>(['s1']);
    const version = ref(0);
    const keys = createResourceKeys('items', () => scope.value);
    const store = createQueryRelationStore<number, string>({
        queryClient,
        keys,
        dependsOn: () => scope.value,
        version
    });

    /** Writes a bucket the way `fetchByParent` would, then moves the version. */
    const seed = (
        parentId: string,
        ids: number[],
        bucket: string[] = [],
        atScope: unknown[] = scope.value
    ) => {
        queryClient.setQueryData<IListCacheEntry<number>>(keys.parent(parentId, atScope, bucket), {
            ids
        });
        version.value++;
    };

    /** The ids a bucket currently holds. */
    const read = (parentId: string, bucket: string[] = [], atScope: unknown[] = scope.value) =>
        queryClient.getQueryData<IListCacheEntry<number>>(keys.parent(parentId, atScope, bucket))
            ?.ids;

    return { queryClient, keys, store, seed, read, version, scope };
};

describe('UNIT · createQueryRelationStore', () => {
    let context: ReturnType<typeof build>;

    beforeEach(() => {
        context = build();
    });

    afterEach(() => {
        context.queryClient.clear();
    });

    it('the dictionary merges every bucket of a parent and keeps parents apart', () => {
        context.seed('p1', [1, 2]);
        context.seed('p1', [2, 3], ['b']);
        context.seed('p2', [9]);

        expect(context.store.dictionary.value).toEqual({ p1: [1, 2, 3], p2: [9] });
    });

    it('removeFromParent edits every bucket of that parent only', () => {
        context.seed('p1', [1, 2]);
        context.seed('p1', [1, 3], ['b']);
        context.seed('p2', [1, 4]);

        context.store.removeFromParent('p1', 1);

        expect(context.read('p1')).toEqual([2]);
        expect(context.read('p1', ['b'])).toEqual([3]);
        // Another parent's bucket holding the same child is not a bucket of p1.
        expect(context.read('p2')).toEqual([1, 4]);
    });

    it('removeFromParent leaves another scope alone', () => {
        context.seed('p1', [1, 2]);
        context.seed('p1', [1, 5], [], ['s2']);

        context.store.removeFromParent('p1', 1);

        expect(context.read('p1')).toEqual([2]);
        expect(context.read('p1', [], ['s2'])).toEqual([1, 5]);
    });

    it('removeDuplicateChildren dedupes the parent buckets and not another parent', () => {
        context.seed('p1', [1, 1, 2]);
        context.seed('p2', [3, 3]);

        context.store.removeDuplicateChildren('p1');

        expect(context.read('p1')).toEqual([1, 2]);
        expect(context.read('p2')).toEqual([3, 3]);
    });

    it('addToParent links a new child into the plain entry, marked stale', () => {
        context.seed('p1', [1], ['b']);

        context.store.addToParent('p1', 2);

        expect(context.read('p1')).toEqual([2]);
        expect(context.read('p1', ['b'])).toEqual([1]);
        expect(
            context.queryClient.getQueryState(context.keys.parent('p1', context.scope.value))
                ?.dataUpdatedAt
        ).toBe(0);
    });

    it('addToParent of a child already linked (in any bucket) is a no-op', () => {
        context.seed('p1', [1], ['b']);
        const plainKey = context.keys.parent('p1', context.scope.value);

        context.store.addToParent('p1', 1);

        // No plain entry was created just to hold a duplicate.
        expect(context.queryClient.getQueryData(plainKey)).toBeUndefined();
    });

    it('addToParent of a child already in the plain entry does not duplicate it', () => {
        context.seed('p1', [1]);

        context.store.addToParent('p1', 1);

        expect(context.read('p1')).toEqual([1]);
        expect(
            context.queryClient.getQueryState(context.keys.parent('p1', context.scope.value))
                ?.dataUpdatedAt
        ).not.toBe(0);
    });

    it('addToParent of a child linked to ANOTHER parent still links it here', () => {
        context.seed('p2', [1]);

        context.store.addToParent('p1', 1);

        expect(context.read('p1')).toEqual([1]);
    });
});
