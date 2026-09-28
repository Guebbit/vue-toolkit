/**
 * TYPES — useStructureDataManagement: generic defaults and the shape of what it returns, plus the
 * IRecordStore/IRelationStore injection points' required-vs-optional contract.
 */
import { ref } from 'vue';
import { expectTypeOf } from 'expect-type';
import { useStructureDataManagement } from '../../src/index.js';
import type {
    IStructureDataManagementApi,
    IRecordStore,
    IRelationStore,
    TIdOf
} from '../../src/composables/structureDataManagement.js';
import type { IUser } from './_fixtures.js';

const c = useStructureDataManagement<IUser>();

// IStructureDataManagementApi: an explicit, exported return interface, not inferred.
expectTypeOf(c).toEqualTypeOf<IStructureDataManagementApi<IUser, number>>();

// K defaults to TIdOf<T>: the type of T['id'] when there is one — number here, IUser's own id
// type — not the union of field names `keyof T`.
expectTypeOf(c.selectedIdentifier.value).toEqualTypeOf<number | undefined>();
expectTypeOf<TIdOf<IUser>>().toEqualTypeOf<number>();

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
expectTypeOf<TIdOf<ISlugged>>().toEqualTypeOf<string | number>();

// A custom K, explicitly requested (a composite id not derivable from T['id'] alone).
const withCompositeId = useStructureDataManagement<IUser, string>(['name', 'email'], '|');
expectTypeOf(withCompositeId.getRecord('Ada|ada@x.com')).toEqualTypeOf<IUser | undefined>();
// @ts-expect-error -- the composite id is typed string, not number
withCompositeId.getRecord(1);

// IRecordStore: only dictionary/write/remove/writeAll/clear are required — resolve/read/
// isFetching are optional, so a minimal custom store (no cheap single-record read, no
// fetched-vs-created distinction) still satisfies it and is accepted as the 3rd argument.
const minimalRecordStore: IRecordStore<IUser, number> = {
    dictionary: ref<Record<number, IUser>>({}),
    write: () => {},
    remove: () => {},
    writeAll: () => {},
    clear: () => {}
};
void useStructureDataManagement<IUser, number>('id', '|', minimalRecordStore);

const incompleteRecordStore = {
    dictionary: ref<Record<number, IUser>>({}),
    remove: () => {},
    writeAll: () => {},
    clear: () => {}
};
// @ts-expect-error -- write is required, not optional like resolve/read/isFetching
void useStructureDataManagement<IUser, number>('id', '|', incompleteRecordStore);

// IRelationStore: dictionary/addToParent/removeFromParent/removeDuplicateChildren are all
// required — there is no optional member to omit, unlike IRecordStore.
const minimalRelationStore: IRelationStore<string, number> = {
    dictionary: ref<Record<string, number[]>>({}),
    addToParent: () => {},
    removeFromParent: () => {},
    removeDuplicateChildren: () => {}
};
void useStructureDataManagement<IUser, number, string>(
    'id',
    '|',
    minimalRecordStore,
    minimalRelationStore
);
