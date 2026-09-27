/**
 * TYPES — useStructureRestApi: record inference, per-call setting refusals, and the required
 * `resourceKey`.
 */
import { ref } from 'vue';
import { expectTypeOf } from 'expect-type';
import { useStructureRestApi } from '../../src/index.js';
import type { IUser } from './_fixtures.js';

const resource = useStructureRestApi<IUser, number>({ resourceKey: 'users' });

// getRecord/itemDictionary/itemList infer from T, keyed by the explicit K.
expectTypeOf(resource.getRecord(1)).toEqualTypeOf<IUser | undefined>();
expectTypeOf(resource.itemDictionary.value).toEqualTypeOf<Record<number, IUser>>();
expectTypeOf(resource.itemList.value).toEqualTypeOf<IUser[]>();

// fetchTarget resolves the stored record.
expectTypeOf(
    resource.fetchTarget(
        // eslint-disable-next-line unicorn/no-useless-undefined -- resolve() alone is always Promise<void>
        () => Promise.resolve<IUser | undefined>(undefined),
        1
    )
).toEqualTypeOf<Promise<IUser | undefined>>();

// @ts-expect-error -- resourceKey is required, with no random fallback
useStructureRestApi<IUser, number>({});

// @ts-expect-error -- the id is typed number, not string
resource.getRecord('1');

// updateTarget's optimistic patch must be Partial<T>.
resource.updateTarget(() => Promise.resolve<IUser>({} as IUser), { name: 'Ada' }, 1);
// @ts-expect-error -- `nope` is not a field of IUser, so the patch isn't Partial<IUser>
resource.updateTarget(() => Promise.resolve<IUser>({} as IUser), { nope: true }, 1);

// Every read apiCall's last parameter is a { signal } context (V2.1); ignoring it still compiles.
resource.fetchTarget((context) => {
    expectTypeOf(context.signal).toEqualTypeOf<AbortSignal>();
    // eslint-disable-next-line unicorn/no-useless-undefined -- resolve() alone is always Promise<void>
    return Promise.resolve<IUser | undefined>(undefined);
}, 1);
resource.fetchTarget(
    // eslint-disable-next-line unicorn/no-useless-undefined -- resolve() alone is always Promise<void>
    () => Promise.resolve<IUser | undefined>(undefined),
    1
);
resource.fetchAll((context) => {
    expectTypeOf(context.signal).toEqualTypeOf<AbortSignal>();
    return Promise.resolve<IUser[]>([]);
});

// fetchMultiple's apiCall receives the missing ids first, the context last (V2.2).
resource.fetchMultiple((ids, context) => {
    expectTypeOf(ids).toEqualTypeOf<number[]>();
    expectTypeOf(context.signal).toEqualTypeOf<AbortSignal>();
    return Promise.resolve<IUser[]>([]);
}, [1, 2]);

// watchAll/watchByParent/watchAny accept enabled and a reactive key (V2.3).
resource.watchAll(() => Promise.resolve<IUser[]>([]), { enabled: ref(true), key: ref(['a']) });
resource.watchByParent(
    () => Promise.resolve<IUser[]>([]),
    ref<number | undefined>(undefined),
    { enabled: () => true, key: () => ['a'] }
);
resource.watchAny(() => Promise.resolve('x'), { key: ref(['stats']), enabled: ref(true) });
// @ts-expect-error -- watchAny's key is required
resource.watchAny(() => Promise.resolve('x'), {});
resource.watchTarget(
    () => 1,
    (id, context) => {
        expectTypeOf(id).toEqualTypeOf<number>();
        expectTypeOf(context.signal).toEqualTypeOf<AbortSignal>();
        // eslint-disable-next-line unicorn/no-useless-undefined -- resolve() alone is always Promise<void>
        return Promise.resolve<IUser | undefined>(undefined);
    }
);
