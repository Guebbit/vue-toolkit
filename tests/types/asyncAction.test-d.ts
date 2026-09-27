/**
 * TYPES — useAsyncAction: `data` and `run`'s arguments are inferred from the wrapped action.
 */
import { expectTypeOf } from 'expect-type';
import { useAsyncAction } from '../../src/index.js';
import type { IUser } from './_fixtures.js';

const action = useAsyncAction((id: number) => Promise.resolve<IUser>({ id } as IUser));

expectTypeOf(action.data.value).toEqualTypeOf<IUser | undefined>();
expectTypeOf(action.run).parameter(0).toEqualTypeOf<number>();
expectTypeOf(action.run).returns.toEqualTypeOf<Promise<IUser | undefined>>();

// @ts-expect-error -- run's argument follows the action's own parameters
action.run('not-a-number');
