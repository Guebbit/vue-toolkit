/**
 * TYPES — useStructureCrudApi: `operations` is required. Its read operations (`list`/`search`/
 * `get`) take a `{ signal }` context as their last argument (V2.1); `create`/`update`/`remove`
 * take an `options` argument instead — the two are not interchangeable.
 */
import { expectTypeOf } from 'expect-type';
import { useStructureCrudApi } from '../../src/index.js';
import type { IFetchContext } from '../../src/composables/structureRestApi.js';
import type { IStructureCrudApi } from '../../src/composables/structureCrudApi.js';
import type { IUser } from './_fixtures.js';

const crud = useStructureCrudApi<IUser, number>(
    {
        list: (context) => {
            expectTypeOf(context).toEqualTypeOf<IFetchContext>();
            return Promise.resolve([]);
        },
        get: (id, context) => {
            expectTypeOf(id).toEqualTypeOf<number>();
            expectTypeOf(context).toEqualTypeOf<IFetchContext>();
            // eslint-disable-next-line unicorn/no-useless-undefined -- resolve() alone is always Promise<void>
            return Promise.resolve(undefined);
        },
        create: (data, options) => {
            expectTypeOf(data).toEqualTypeOf<Partial<IUser>>();
            expectTypeOf(options).toEqualTypeOf<unknown>();
            // eslint-disable-next-line unicorn/no-useless-undefined -- resolve() alone is always Promise<void>
            return Promise.resolve(undefined);
        }
    },
    { resourceKey: 'users' }
);

expectTypeOf(crud.fetchOne).parameter(0).toEqualTypeOf<number>();

// IStructureCrudApi is (still) an explicit, exported return interface, not inferred (V2.8).
expectTypeOf(crud).toEqualTypeOf<IStructureCrudApi<IUser, number>>();

// An operation ignoring the context it doesn't need still compiles.
useStructureCrudApi<IUser, number>(
    {
        // eslint-disable-next-line unicorn/no-useless-undefined -- resolve() alone is always Promise<void>
        get: (_id: number) => Promise.resolve(undefined)
    },
    { resourceKey: 'users' }
);

useStructureCrudApi<IUser, number>(
    {
        // @ts-expect-error -- `get`'s 2nd argument is a read context, never a write's `options`
        // eslint-disable-next-line unicorn/no-useless-undefined -- resolve() alone is always Promise<void>
        get: (_id: number, _options: { retries: number }) => Promise.resolve(undefined)
    },
    { resourceKey: 'users' }
);

// @ts-expect-error -- operations is required (no default `{}`)
useStructureCrudApi<IUser, number>(undefined, { resourceKey: 'users' });

// @ts-expect-error -- settings (and its resourceKey) is required too
useStructureCrudApi<IUser, number>({});

// createOne/updateOne/deleteOne take one settings object: requestOptions instead of a bare
// per-call options argument, plus dummyData/merge/applyResponse/key (V2.5).
interface IRequestOptions {
    signal?: AbortSignal;
}
const writable = useStructureCrudApi<
    IUser,
    number,
    object,
    Partial<IUser>,
    Partial<IUser>,
    IRequestOptions
>(
    {
        create: (_data, options) => {
            expectTypeOf(options).toEqualTypeOf<IRequestOptions | undefined>();
            // eslint-disable-next-line unicorn/no-useless-undefined -- resolve() alone is always Promise<void>
            return Promise.resolve(undefined);
        }
    },
    { resourceKey: 'users' }
);
void writable.createOne(
    { name: 'Ada' },
    { requestOptions: { signal: new AbortController().signal } }
);
void writable.createOne(
    { name: 'Ada' },
    { dummyData: { id: 1, name: 'Ada', email: 'ada@x.com' } }
);
void writable.updateOne(1, { name: 'Ada' }, { merge: true, applyResponse: false, key: ['x'] });
void writable.deleteOne(1, { requestOptions: { signal: new AbortController().signal } });
// @ts-expect-error -- requestOptions, never a bare per-call argument
void writable.createOne({ name: 'Ada' }, { signal: new AbortController().signal });
