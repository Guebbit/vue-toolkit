/**
 * useStructureDataManagement's 4th parameter: the IRelationStore parent/child links go through.
 * A spy store shows which writes reach it, and that the default (no store given) builds its own
 * independent local state rather than sharing one across instances.
 */

import { ref, type Ref } from 'vue';
import {
    useStructureDataManagement,
    type IRelationStore
} from '../../src/composables/structureDataManagement';

interface IItem {
    id: number;
    name: string;
}

/** A single-parent dictionary, built by assignment: a hyphenated key trips naming-convention. */
const teamOf = (ids: number[]): Record<string, number[]> => {
    const result: Record<string, number[]> = { ['team-1']: ids };
    return result;
};

/** A store over a plain ref, each method a spy that also applies the write. */
const spyStore = () => {
    const dictionary = ref({}) as Ref<Record<string, number[]>>;
    const store = {
        dictionary,
        addToParent: jest.fn((parentId: string, childId: number) => {
            dictionary.value = {
                ...dictionary.value,
                [parentId]: [...(dictionary.value[parentId] ?? []), childId]
            };
        }),
        removeFromParent: jest.fn((parentId: string, childId: number) => {
            dictionary.value = {
                ...dictionary.value,
                [parentId]: (dictionary.value[parentId] ?? []).filter((id) => id !== childId)
            };
        }),
        removeDuplicateChildren: jest.fn((parentId: string) => {
            dictionary.value = {
                ...dictionary.value,
                [parentId]: [...new Set(dictionary.value[parentId])]
            };
        })
    } satisfies IRelationStore<string, number>;
    return store;
};

/** A composable over a fresh spy relation store. */
const make = () => {
    const store = spyStore();
    return {
        store,
        records: useStructureDataManagement<IItem, number, string>('id', '|', undefined, store)
    };
};

describe('useStructureDataManagement · relationStore', () => {
    it('reads through the store: what the store holds is what parentHasMany shows', () => {
        const { store, records } = make();
        store.dictionary.value = teamOf([1, 2]);

        expect(records.parentHasMany.value).toEqual(teamOf([1, 2]));
    });

    it('addToParent / removeFromParent / removeDuplicateChildren write through the store', () => {
        const { store, records } = make();

        records.addToParent('team-1', 1);
        expect(store.addToParent).toHaveBeenCalledWith('team-1', 1);

        records.removeFromParent('team-1', 1);
        expect(store.removeFromParent).toHaveBeenCalledWith('team-1', 1);

        records.removeDuplicateChildren('team-1');
        expect(store.removeDuplicateChildren).toHaveBeenCalledWith('team-1');
    });

    it('getRecordsByParent / getListByParent read through the store', () => {
        const { store, records } = make();
        records.addRecord({ id: 1, name: 'Alice' });
        store.dictionary.value = teamOf([1]);

        expect(records.getListByParent('team-1')).toEqual([{ id: 1, name: 'Alice' }]);
        expect(Object.keys(records.getRecordsByParent('team-1'))).toEqual(['1']);
    });

    it('without a store, two instances keep independent local relation state', () => {
        const a = useStructureDataManagement<IItem, number, string>('id');
        const b = useStructureDataManagement<IItem, number, string>('id');

        a.addToParent('team-1', 1);

        expect(a.parentHasMany.value).toEqual(teamOf([1]));
        expect(b.parentHasMany.value).toEqual({});
    });
});
