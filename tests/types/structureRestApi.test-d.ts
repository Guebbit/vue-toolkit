/**
 * TYPES — useStructureRestApi: record inference, per-call setting refusals, and the required
 * `resourceKey`.
 */
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
