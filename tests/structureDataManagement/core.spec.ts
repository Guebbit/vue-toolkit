import { useStructureDataManagement } from '../../src/composables/structureDataManagement';

interface ITestItem {
    id: number;
    name: string;
}

describe('useStructureDataManagement', () => {
    let composable: ReturnType<typeof useStructureDataManagement<ITestItem>>;

    beforeEach(() => {
        composable = useStructureDataManagement<ITestItem>('id');
    });

    describe('addRecord / getRecord', () => {
        it('adds a record and retrieves it by id', () => {
            const item: ITestItem = { id: 1, name: 'Alice' };
            composable.addRecord(item);
            expect(composable.getRecord(1 as never)).toEqual(item);
        });

        it('overwrites an existing record when added again', () => {
            composable.addRecord({ id: 1, name: 'Alice' });
            composable.addRecord({ id: 1, name: 'Bob' });
            expect(composable.getRecord(1 as never)).toEqual({ id: 1, name: 'Bob' });
        });

        it('returns undefined for a missing record', () => {
            expect(composable.getRecord(99 as never)).toBeUndefined();
        });
    });

    describe('addRecords / itemList', () => {
        it('adds multiple records and exposes them in itemList', () => {
            composable.addRecords([
                { id: 1, name: 'Alice' },
                { id: 2, name: 'Bob' }
            ]);
            expect(composable.itemList.value).toHaveLength(2);
        });

        it('skips undefined entries in addRecords', () => {
            composable.addRecords([{ id: 1, name: 'Alice' }, undefined]);
            expect(composable.itemList.value).toHaveLength(1);
        });
    });

    describe('editRecord', () => {
        it('merges partial data into an existing record', () => {
            composable.addRecord({ id: 1, name: 'Alice' });
            composable.editRecord({ name: 'Alice Updated' }, 1 as never);
            expect(composable.getRecord(1 as never)).toEqual({ id: 1, name: 'Alice Updated' });
        });

        it('creates a new record when create flag is true and id is missing', () => {
            const createdId = composable.editRecord({ id: 2, name: 'Bob' }, undefined, true);

            // the id comes from `data`, and the call reports it as created
            expect(createdId).toBe(2);
            expect(composable.getRecord(2)).toEqual({ id: 2, name: 'Bob' });
        });
    });

    describe('deleteRecord', () => {
        it('removes a record from the dictionary', () => {
            composable.addRecord({ id: 1, name: 'Alice' });
            composable.deleteRecord(1 as never);
            expect(composable.getRecord(1 as never)).toBeUndefined();
        });
    });

    describe('setRecords / resetRecords', () => {
        it('sets the full dictionary directly', () => {
            composable.setRecords({ alice: { id: 1, name: 'Alice' } } as never);
            expect(composable.itemList.value).toHaveLength(1);
        });

        it('resets the dictionary to empty', () => {
            composable.addRecord({ id: 1, name: 'Alice' });
            composable.resetRecords();
            expect(composable.itemList.value).toHaveLength(0);
        });
    });

    describe('selectedRecord', () => {
        it('returns the selected record when selectedIdentifier is set', () => {
            const item: ITestItem = { id: 1, name: 'Alice' };
            composable.addRecord(item);
            composable.selectedIdentifier.value = 1 as never;
            expect(composable.selectedRecord.value).toEqual(item);
        });
    });

    describe('pagination', () => {
        beforeEach(() => {
            composable.addRecords(
                Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` }))
            );
            composable.pageSize.value = 10;
        });

        it('calculates total pages correctly', () => {
            expect(composable.pageTotal.value).toBe(3);
        });

        it('returns items for the current page', () => {
            composable.pageCurrent.value = 1;
            expect(composable.pageItemList.value).toHaveLength(10);
        });

        it('returns remaining items on the last page', () => {
            composable.pageCurrent.value = 3;
            expect(composable.pageItemList.value).toHaveLength(5);
        });

        // Infinity has no whole page size: taken as written, its first page reads NaN (Infinity * 0)
        // as an offset and shows nothing, with a pageTotal of 0.
        it.each([Infinity, -Infinity])(
            'ignores a pageSize of %p, keeping the current one',
            (size) => {
                composable.pageSize.value = size;

                expect(composable.pageSize.value).toBe(10);
                expect(composable.pageItemList.value).toHaveLength(10);
            }
        );
    });

    describe('parent-child relationships', () => {
        it('adds a child to a parent and retrieves it', () => {
            composable.addRecord({ id: 1, name: 'Child' });
            composable.addToParent('parent-1', 1);
            const list = composable.getListByParent('parent-1');
            expect(list).toHaveLength(1);
        });

        it('removes a child from a parent', () => {
            composable.addRecord({ id: 1, name: 'Child' });
            composable.addToParent('parent-1', 1);
            composable.removeFromParent('parent-1', 1);
            const list = composable.getListByParent('parent-1');
            expect(list).toHaveLength(0);
        });

        // Child ids compare as object keys, same as the REST store: `'1'` (a route param) is the
        // linked `1`.
        it('removeFromParent unlinks a child whether its id comes as a number or a string', () => {
            const store = useStructureDataManagement<ITestItem, number | string, string>();
            store.addToParent('parent-1', 1);

            store.removeFromParent('parent-1', '1');

            expect(store.parentHasMany.value['parent-1']).toEqual([]);
        });
    });
});

describe('useStructureDataManagement · parent ids', () => {
    it('treats 0 as a real parent id', () => {
        const store = useStructureDataManagement<ITestItem, number, number>();
        store.addRecord({ id: 1, name: 'child' });
        store.addToParent(0, '1');

        expect(store.getListByParent(0)).toEqual([{ id: 1, name: 'child' }]);
    });
});
