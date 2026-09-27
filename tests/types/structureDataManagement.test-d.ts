/**
 * TYPES — useStructureDataManagement: generic defaults and the shape of what it returns.
 */
import { expectTypeOf } from 'expect-type';
import { useStructureDataManagement } from '../../src/index.js';
import type { IUser } from './_fixtures.js';

const c = useStructureDataManagement<IUser>();

// K defaults to `keyof T` (the field names), not the id's own type — pinned deliberately (§9).
expectTypeOf(c.selectedIdentifier.value).toEqualTypeOf<keyof IUser | undefined>();

// itemDictionary/itemList/getRecord infer from T.
expectTypeOf(c.itemDictionary.value).toEqualTypeOf<Record<keyof IUser, IUser>>();
expectTypeOf(c.itemList.value).toEqualTypeOf<IUser[]>();
expectTypeOf(c.getRecord('id')).toEqualTypeOf<IUser | undefined>();
// @ts-expect-error -- K is `keyof IUser`, not an arbitrary string
c.getRecord('not-a-field');

// A custom K, explicitly requested (composite/typed ids not derivable from `keyof T` alone).
const withNumericId = useStructureDataManagement<IUser, number>('id');
expectTypeOf(withNumericId.getRecord(1)).toEqualTypeOf<IUser | undefined>();
// @ts-expect-error -- the id is typed number, not string
withNumericId.getRecord('1');
