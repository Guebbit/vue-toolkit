/**
 * EFFECT STABILITY — the reactive contract of useStructureDataManagement.
 *
 * These specs don't check WHAT the computeds return (structureDataManagement.spec.ts
 * does that); they check WHEN they re-evaluate. A composable that recomputes too
 * eagerly makes every consuming component re-render on unrelated writes; one that
 * recomputes too little serves stale UI. Both are invisible to value-only tests and
 * both are exactly what a Vue reactivity regression looks like.
 *
 * Every watcher uses `flush: 'sync'` so one reactive write == at most one callback,
 * making the fire COUNT itself the assertion.
 */

import { watch, effectScope } from 'vue';
import { useStructureDataManagement } from '../src/composables/structureDataManagement';

interface IItem {
    id: number;
    name: string;
    tag?: string;
}

const make = () => useStructureDataManagement<IItem>('id');

/** Counts how many times `source` pushes a NEW value to a synchronous watcher. */
const countFires = <T>(source: Parameters<typeof watch>[0], run: () => void): number => {
    let fires = 0;
    const stop = watch(source, () => void (fires += 1), { flush: 'sync' });
    run();
    stop();
    return fires;
};

describe('EFFECT STABILITY · useStructureDataManagement', () => {
    describe('selectedRecord — property-level tracking', () => {
        it('does NOT re-fire when an UNRELATED record changes', () => {
            const c = make();
            c.addRecord({ id: 1, name: 'a' });
            c.addRecord({ id: 2, name: 'b' });
            c.selectedIdentifier.value = 1;

            const fires = countFires(c.selectedRecord, () => {
                c.editRecord({ name: 'b-edited' }, 2 as never); // not the selected one
                c.addRecord({ id: 3, name: 'c' }); // brand-new, unrelated
            });

            expect(fires).toBe(0);
        });

        it('re-fires exactly once when the SELECTED record changes', () => {
            const c = make();
            c.addRecord({ id: 1, name: 'a' });
            c.selectedIdentifier.value = 1;

            const fires = countFires(c.selectedRecord, () => {
                c.editRecord({ name: 'a-edited' }, 1 as never);
            });

            expect(fires).toBe(1);
        });

        it('re-fires when the selected IDENTIFIER changes to another record', () => {
            const c = make();
            c.addRecord({ id: 1, name: 'a' });
            c.addRecord({ id: 2, name: 'b' });
            c.selectedIdentifier.value = 1;

            const fires = countFires(c.selectedRecord, () => {
                c.selectedIdentifier.value = 2;
            });

            expect(fires).toBe(1);
        });

        it('tracks a not-yet-existing selection and fires when that record is added', () => {
            const c = make();
            c.selectedIdentifier.value = 5; // nothing there yet

            const fires = countFires(c.selectedRecord, () => {
                c.addRecord({ id: 5, name: 'late' });
            });

            expect(fires).toBe(1);
        });
    });

    describe('lastInsertedRecord', () => {
        it('reacts to each insert and ends pointing at the most recent record', () => {
            const c = make();
            let fires = 0;
            const seen: (string | undefined)[] = [];
            const stop = watch(
                c.lastInsertedRecord,
                (r) => {
                    fires += 1;
                    seen.push(r?.name);
                },
                { flush: 'sync' }
            );

            c.addRecord({ id: 1, name: 'a' });
            c.addRecord({ id: 2, name: 'b' });
            stop();

            // it moved (fired at least once per insert) and settled on the last record
            expect(fires).toBeGreaterThanOrEqual(2);
            expect(seen).toContain('a');
            expect(seen).toContain('b');
            expect(c.lastInsertedRecord.value?.name).toBe('b');
        });
    });

    describe('itemList', () => {
        it('re-fires once per structural write', () => {
            const c = make();
            const fires = countFires(c.itemList, () => {
                c.addRecord({ id: 1, name: 'a' });
                c.addRecord({ id: 2, name: 'b' });
                c.deleteRecord(1 as never);
            });
            expect(fires).toBe(3);
        });
    });

    describe('pagination computeds are derived, not duplicated state', () => {
        it('pageTotal re-derives from item count and pageSize', () => {
            const c = make();
            c.addRecords(Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `n${i}` })));
            expect(c.pageTotal.value).toBe(3); // ceil(25 / 10)

            c.pageSize.value = 5;
            expect(c.pageTotal.value).toBe(5); // ceil(25 / 5), recomputed from the new pageSize
        });

        it('pageOffset and pageItemList track pageCurrent without extra state', () => {
            const c = make();
            c.addRecords(Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `n${i}` })));

            expect(c.pageOffset.value).toBe(0);
            expect(c.pageItemList.value.map((i) => i.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

            c.pageCurrent.value = 3;
            expect(c.pageOffset.value).toBe(20);
            expect(c.pageItemList.value.map((i) => i.id)).toEqual([21, 22, 23, 24, 25]);
        });

        it('pageItemList does NOT re-fire when only pageSize-irrelevant state changes', () => {
            const c = make();
            c.addRecords(Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: `n${i}` })));

            // selecting a record touches selectedIdentifier, which pageItemList must not depend on
            const fires = countFires(c.pageItemList, () => {
                c.selectedIdentifier.value = 2;
            });
            expect(fires).toBe(0);
        });
    });

    describe('scope disposal', () => {
        it('reactive state created in an effectScope stops driving effects once the scope is stopped', () => {
            const scope = effectScope();

            let c!: ReturnType<typeof make>;
            scope.run(() => {
                c = make();
            });

            let fires = 0;
            scope.run(() => {
                watch(c.itemList, () => void (fires += 1), { flush: 'sync' });
            });

            c.addRecord({ id: 1, name: 'a' });
            expect(fires).toBe(1);

            scope.stop(); // disposes the watcher registered inside the scope

            c.addRecord({ id: 2, name: 'b' });
            expect(fires).toBe(1); // no further reactions after teardown
        });
    });
});
