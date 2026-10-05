/**
 * TYPES — useStructureRestApi: record inference, per-call setting refusals, and the required
 * `resourceKey`.
 */
import { ref, type ComputedRef } from 'vue';
import { expectTypeOf } from 'expect-type';
import { useStructureRestApi } from '../../src/index.js';
import type { IStructureRestApi, IWatchHandle } from '../../src/composables/structureRestApi.js';
import type { IUser } from './_fixtures.js';

const resource = useStructureRestApi<IUser, number>({ resourceKey: 'users' });

// IStructureRestApi names the RETURN type, as an explicit, exported interface.
expectTypeOf(resource).toEqualTypeOf<IStructureRestApi<IUser, number>>();

// getRecord/itemDictionary/itemList infer from T, keyed by the explicit K.
expectTypeOf(resource.getRecord(1)).toEqualTypeOf<IUser | undefined>();
expectTypeOf(resource.itemDictionary.value).toEqualTypeOf<Record<number, IUser>>();
expectTypeOf(resource.itemList.value).toEqualTypeOf<IUser[]>();

// Derived views are typed as the computeds they are, so they read-only type-check as such.
expectTypeOf(resource.itemList).toEqualTypeOf<ComputedRef<IUser[]>>();
expectTypeOf(resource.selectedRecord).toEqualTypeOf<ComputedRef<IUser | undefined>>();
expectTypeOf(resource.lastInsertedRecord).toEqualTypeOf<ComputedRef<IUser | undefined>>();
expectTypeOf(resource.pageTotal).toEqualTypeOf<ComputedRef<number>>();
expectTypeOf(resource.pageOffset).toEqualTypeOf<ComputedRef<number>>();
expectTypeOf(resource.pageItemList).toEqualTypeOf<ComputedRef<IUser[]>>();

// Unlinking returns the parent's remaining child ids, as the local store's does.
expectTypeOf(resource.removeFromParent('team', 1)).toEqualTypeOf<number[]>();
expectTypeOf(resource.removeDuplicateChildren('team')).toEqualTypeOf<number[]>();

// fetchTarget resolves the stored record.
expectTypeOf(
    resource.fetchTarget(
        () => Promise.resolve<IUser | undefined>(undefined),
        1
    )
).toEqualTypeOf<Promise<IUser | undefined>>();

// @ts-expect-error -- resourceKey is required, with no random fallback
useStructureRestApi<IUser, number>({});

// @ts-expect-error -- the id is typed number, not string
resource.getRecord('1');

// updateTarget's optimistic patch must be Partial<T>.
void resource.updateTarget(() => Promise.resolve<IUser>({} as IUser), { name: 'Ada' }, 1);
// @ts-expect-error -- `nope` is not a field of IUser, so the patch isn't Partial<IUser>
void resource.updateTarget(() => Promise.resolve<IUser>({} as IUser), { nope: true }, 1);

// Every read apiCall's last parameter is a { signal } context; ignoring it still compiles.
void resource.fetchTarget((context) => {
    expectTypeOf(context.signal).toEqualTypeOf<AbortSignal>();
    return Promise.resolve<IUser | undefined>(undefined);
}, 1);
void resource.fetchTarget(
    () => Promise.resolve<IUser | undefined>(undefined),
    1
);
void resource.fetchAll((context) => {
    expectTypeOf(context.signal).toEqualTypeOf<AbortSignal>();
    return Promise.resolve<IUser[]>([]);
});

// fetchMultiple's apiCall receives the missing ids first, the context last.
void resource.fetchMultiple((ids, context) => {
    expectTypeOf(ids).toEqualTypeOf<number[]>();
    expectTypeOf(context.signal).toEqualTypeOf<AbortSignal>();
    return Promise.resolve<IUser[]>([]);
}, [1, 2]);

// watchAll/watchByParent/watchAny accept enabled and a reactive key.
resource.watchAll(() => Promise.resolve<IUser[]>([]), { enabled: ref(true), key: ref(['a']) });
resource.watchByParent(
    () => Promise.resolve<IUser[]>([]),
    ref<number | undefined>(undefined),
    { enabled: () => true, key: () => ['a'] }
);
resource.watchAny(() => Promise.resolve('x'), { key: ref(['stats']), enabled: ref(true) });
// @ts-expect-error -- watchAny's key is required
resource.watchAny(() => Promise.resolve('x'), {});
// watchTarget takes apiCall first, idSource second — same order as fetchTarget/watchByParent.
const watchHandle = resource.watchTarget(
    (id, context) => {
        expectTypeOf(id).toEqualTypeOf<number>();
        expectTypeOf(context.signal).toEqualTypeOf<AbortSignal>();
        return Promise.resolve<IUser | undefined>(undefined);
    },
    () => 1
);

// IWatchHandle: every watch* returns the same handle — stop/refetch/suspense, error, and the
// query's state — and never rejects.
expectTypeOf(watchHandle).toEqualTypeOf<IWatchHandle<IUser | undefined>>();
expectTypeOf(watchHandle.data).toEqualTypeOf<ComputedRef<IUser | undefined>>();
expectTypeOf(watchHandle.isFetching.value).toEqualTypeOf<boolean>();
expectTypeOf(watchHandle.dataUpdatedAt.value).toEqualTypeOf<number>();
expectTypeOf(resource.watchAll(() => Promise.resolve([])).data.value).toEqualTypeOf<
    (IUser | undefined)[]
>();

// watchTarget takes a plain id too, not only a Ref or getter.
resource.watchTarget(() => Promise.resolve(undefined), 1);

// watchAll/watchByParent callbacks: the bucket key, or the parent id, as context.
resource.watchAll(() => Promise.resolve([]), {
    onSuccess: (items, key) => {
        expectTypeOf(items).toEqualTypeOf<(IUser | undefined)[]>();
        expectTypeOf(key).toEqualTypeOf<string[] | undefined>();
    }
});
resource.watchByParent(() => Promise.resolve([]), 'team', {
    onError: (_error, parentId) => expectTypeOf(parentId).toEqualTypeOf<string | number>()
});

// Targeted invalidation settles once the active refetches have.
expectTypeOf(resource.invalidateTarget(1)).toEqualTypeOf<Promise<void>>();
expectTypeOf(resource.invalidateLists()).toEqualTypeOf<Promise<void>>();

// The cache views are read-only computeds.
expectTypeOf(resource.itemDictionary).toEqualTypeOf<ComputedRef<Record<number, IUser>>>();
