/**
 * TYPES — useStructureCrudApi: `operations` is required, and its read operations (`list`/
 * `search`/`get`) take no `options` argument — only `create`/`update`/`remove` do.
 */
import { expectTypeOf } from 'expect-type';
import { useStructureCrudApi } from '../../src/index.js';
import type { IUser } from './_fixtures.js';

const crud = useStructureCrudApi<IUser, number>(
    {
        list: () => Promise.resolve([]),
        get: (id) => {
            expectTypeOf(id).toEqualTypeOf<number>();
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

useStructureCrudApi<IUser, number>(
    {
        // @ts-expect-error -- `get`'s declared shape takes only an id, no options
        get: (id: number, options: unknown) => Promise.resolve()
    },
    { resourceKey: 'users' }
);

// @ts-expect-error -- operations is required (no default `{}`)
useStructureCrudApi<IUser, number>(undefined, { resourceKey: 'users' });

// @ts-expect-error -- settings (and its resourceKey) is required too
useStructureCrudApi<IUser, number>({});
