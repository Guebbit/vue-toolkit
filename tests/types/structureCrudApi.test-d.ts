/**
 * TYPES — useStructureCrudApi: `operations` is required. Its read operations (`list`/`search`/
 * `get`) take a `{ signal }` context as their last argument (V2.1); `create`/`update`/`remove`
 * take an `options` argument instead — the two are not interchangeable.
 */
import { expectTypeOf } from 'expect-type';
import { useStructureCrudApi } from '../../src/index.js';
import type { IFetchContext } from '../../src/composables/structureRestApi.js';
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
        get: (id: number, options: { retries: number }) => Promise.resolve()
    },
    { resourceKey: 'users' }
);

// @ts-expect-error -- operations is required (no default `{}`)
useStructureCrudApi<IUser, number>(undefined, { resourceKey: 'users' });

// @ts-expect-error -- settings (and its resourceKey) is required too
useStructureCrudApi<IUser, number>({});
