/**
 * TYPES — useStructureDataManagement: generic defaults and the shape of what it returns.
 */
import { expectTypeOf } from 'expect-type';
import { useStructureDataManagement } from '../../src/index.js';
import type { IUser } from './_fixtures.js';

const c = useStructureDataManagement<IUser>();

// K defaults to TIdOf<T> (VD1): the type of T['id'] when there is one — number here, IUser's own
// id type — not the union of field names `keyof T` used to produce.
expectTypeOf(c.selectedIdentifier.value).toEqualTypeOf<number | undefined>();

// itemDictionary/itemList/getRecord infer from T.
expectTypeOf(c.itemDictionary.value).toEqualTypeOf<Record<number, IUser>>();
expectTypeOf(c.itemList.value).toEqualTypeOf<IUser[]>();
expectTypeOf(c.getRecord(1)).toEqualTypeOf<IUser | undefined>();
// @ts-expect-error -- K is IUser['id']'s type (number), not a field name
c.getRecord('id');

// A record with no `id` field at all: TIdOf falls back to `string | number`.
interface ISlugged {
    slug: string;
}
const withNoId = useStructureDataManagement<ISlugged>();
expectTypeOf(withNoId.getRecord('a-slug')).toEqualTypeOf<ISlugged | undefined>();
expectTypeOf(withNoId.getRecord(1)).toEqualTypeOf<ISlugged | undefined>();

// A custom K, explicitly requested (a composite id not derivable from T['id'] alone).
const withCompositeId = useStructureDataManagement<IUser, string>(['name', 'email'], '|');
expectTypeOf(withCompositeId.getRecord('Ada|ada@x.com')).toEqualTypeOf<IUser | undefined>();
// @ts-expect-error -- the composite id is typed string, not number
withCompositeId.getRecord(1);
