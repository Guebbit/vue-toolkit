/**
 * useStructureDataManagement's 3rd parameter: the IRecordStore every read and write goes through.
 * A spy store shows which writes reach it. Freshness is the store's own business (the REST
 * layer's store counts writes made while storing a server answer as fresh): the composable only
 * says what to write.
 */

import { ref, type Ref } from 'vue';
import {
    useStructureDataManagement,
    type IRecordStore
} from '../../src/composables/structureDataManagement';

interface IItem {
    id: number;
    name: string;
}

const ALICE: IItem = { id: 1, name: 'Alice' };
const BOB: IItem = { id: 2, name: 'Bob' };

/** A dictionary by id (built by assignment: a numeric-keyed object literal trips naming-convention). */
const dictOf = (...items: IItem[]): Record<number, IItem> => {
    const result: Record<number, IItem> = {};
    for (const item of items) result[item.id] = item;
    return result;
};

/** A store over a plain ref, each method a spy that also applies the write. */
const spyStore = () => {
    const dictionary = ref({}) as Ref<Record<number, IItem>>;
    const store = {
        dictionary,
        write: jest.fn((id: number, item: IItem) => {
            dictionary.value = { ...dictionary.value, [id]: item };
        }),
        remove: jest.fn((id: number) => {
            const { [id]: _removed, ...rest } = dictionary.value;
            dictionary.value = rest;
        }),
        writeAll: jest.fn((items: Record<number, IItem>) => {
            dictionary.value = items;
        }),
        clear: jest.fn(() => {
            dictionary.value = {};
        })
    } satisfies IRecordStore<IItem, number>;
    return store;
};

/** A composable over a fresh spy store. */
const make = () => {
    const store = spyStore();
    return { store, records: useStructureDataManagement<IItem, number>('id', '|', store) };
};

describe('useStructureDataManagement · recordStore', () => {
    it('reads through the store: what the store holds is what the composable shows', () => {
        const { store, records } = make();
        store.dictionary.value = dictOf(ALICE);

        expect(records.getRecord(1)).toEqual(ALICE);
        expect(records.itemList.value).toEqual([ALICE]);
    });

    it('addRecord / addRecords write each record under its id', () => {
        const { store, records } = make();

        records.addRecord(ALICE);
        records.addRecords([BOB]);

        expect(store.write.mock.calls).toEqual([
            [1, ALICE],
            [2, BOB]
        ]);
    });

    it('editRecord writes the merged record', () => {
        const { store, records } = make();
        records.addRecord(ALICE);
        store.write.mockClear();

        records.editRecord({ name: 'Alice 2' }, 1);

        expect(store.write.mock.calls).toEqual([[1, { id: 1, name: 'Alice 2' }]]);
    });

    it('editRecord without create edits only an existing record, id 0 included', () => {
        const { store, records } = make();
        records.addRecord({ id: 0, name: 'Zero' });
        store.write.mockClear();
        const error = jest.spyOn(console, 'error').mockImplementation(() => {});

        records.editRecord({ name: 'Zero 2' }, 0, false);
        records.editRecord({ name: 'Ghost' }, 7, false);

        expect(store.write.mock.calls).toEqual([[0, { id: 0, name: 'Zero 2' }]]);
        expect(error).toHaveBeenCalledTimes(1);
        error.mockRestore();
    });

    it('deleteRecord removes through the store, only a record it holds', () => {
        const { store, records } = make();
        records.addRecord(ALICE);

        records.deleteRecord(1);
        records.deleteRecord(99);

        expect(store.remove.mock.calls).toEqual([[1]]);
        expect(records.getRecord(1)).toBeUndefined();
    });

    it('setRecords / resetRecords replace and empty through the store', () => {
        const { store, records } = make();

        records.setRecords(dictOf(ALICE, BOB));
        expect(store.writeAll).toHaveBeenCalledWith(dictOf(ALICE, BOB));
        expect(records.itemList.value).toHaveLength(2);

        records.resetRecords();
        expect(store.clear).toHaveBeenCalledTimes(1);
        expect(records.itemList.value).toEqual([]);
    });
});
