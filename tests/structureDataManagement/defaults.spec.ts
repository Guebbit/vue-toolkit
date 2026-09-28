/**
 * Empty defaults of useStructureDataManagement: an omitted argument or a parent with no stored
 * children yields an empty result, never a phantom element. A no-op relation store keeps the
 * `?? []` fallbacks reachable (the built-in one always writes the entry first).
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

/** A relation store whose writes change nothing, so the dictionary stays empty. */
const inertStore = (): IRelationStore<string, number> => ({
    dictionary: ref({}) as Ref<Record<string, number[]>>,
    addToParent: () => {},
    removeFromParent: () => {},
    removeDuplicateChildren: () => {}
});

describe('useStructureDataManagement · empty defaults', () => {
    it('getRecords() with no argument returns an empty list', () => {
        const records = useStructureDataManagement<IItem, number, string>('id');
        expect(records.getRecords()).toEqual([]);
    });

    it('default store: removing from an unknown parent leaves it with no children', () => {
        const records = useStructureDataManagement<IItem, number, string>('id');
        expect(records.removeFromParent('team-1', 1)).toEqual([]);
        expect(records.parentHasMany.value['team-1']).toEqual([]);
    });

    it('default store: deduplicating an unknown parent leaves it with no children', () => {
        const records = useStructureDataManagement<IItem, number, string>('id');
        expect(records.removeDuplicateChildren('team-1')).toEqual([]);
        expect(records.parentHasMany.value['team-1']).toEqual([]);
    });

    it('removeFromParent on a parent the store does not hold returns []', () => {
        const records = useStructureDataManagement<IItem, number, string>(
            'id',
            '|',
            undefined,
            inertStore()
        );
        expect(records.removeFromParent('team-1', 1)).toEqual([]);
    });

    it('removeDuplicateChildren on a parent the store does not hold returns []', () => {
        const records = useStructureDataManagement<IItem, number, string>(
            'id',
            '|',
            undefined,
            inertStore()
        );
        expect(records.removeDuplicateChildren('team-1')).toEqual([]);
    });

    it('getRecordsByParent / getListByParent of an unknown parent are empty', () => {
        const records = useStructureDataManagement<IItem, number, string>(
            'id',
            '|',
            undefined,
            inertStore()
        );
        expect(records.getRecordsByParent('team-1')).toEqual({});
        expect(records.getListByParent('team-1')).toEqual([]);
    });
});
