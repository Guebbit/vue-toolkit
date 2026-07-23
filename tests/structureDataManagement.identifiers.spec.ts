/**
 * UNIT — identifier resolution, batch edits and the error/guard branches of
 * useStructureDataManagement.
 *
 * The base spec covers the happy path; these cover the logic that only runs at
 * the edges and was previously untested: fallback-id generation for records that
 * arrive without their identifier, multiple/custom identifiers, editRecords batch
 * semantics, and the create=false guard rails. These are exactly the branches a
 * value-only happy-path suite silently skips.
 */

import { useStructureDataManagement } from '../src/composables/structureDataManagement';

interface IItem {
    id?: number | string;
    name: string;
}

describe('UNIT · identifier resolution & guards', () => {
    let warn: jest.SpyInstance;
    let error: jest.SpyInstance;

    beforeEach(() => {
        warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        error = jest.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        warn.mockRestore();
        error.mockRestore();
    });

    describe('createIdentifier — single identifier', () => {
        it('returns the identifier value when present', () => {
            const c = useStructureDataManagement<IItem>('id');
            expect(c.createIdentifier({ id: 7, name: 'x' })).toBe(7);
            expect(warn).not.toHaveBeenCalled();
        });

        it('generates a fallback id when the identifier is missing, and WRITES it back onto the item', () => {
            const c = useStructureDataManagement<IItem>('id');
            const item: IItem = { name: 'no-id' };
            const id = c.createIdentifier(item);

            expect(id).toBeDefined();
            expect(item.id).toBe(id); // the generated id is persisted on the item itself
            expect(warn).toHaveBeenCalled();
        });

        it('is STABLE across repeated calls on the same item (id is generated once, then read back)', () => {
            const c = useStructureDataManagement<IItem>('id');
            const item: IItem = { name: 'no-id' };
            const first = c.createIdentifier(item);
            const second = c.createIdentifier(item);
            expect(second).toBe(first);
        });

        it('treats null like missing (generates a fallback)', () => {
            const c = useStructureDataManagement<IItem>('id');
            // eslint-disable-next-line unicorn/no-null
            const item = { id: null, name: 'x' } as unknown as IItem;
            const id = c.createIdentifier(item);
            expect(id).toBeDefined();
            expect(item.id).toBe(id);
        });

        it('supports a custom identifier field via the second argument', () => {
            const c = useStructureDataManagement<Record<string, unknown>>('id');
            expect(c.createIdentifier({ id: 1, slug: 'abc' }, 'slug')).toBe('abc');
        });
    });

    describe('createIdentifier — multiple identifiers', () => {
        it('joins the identifier values with the delimiter, in declared order', () => {
            const c = useStructureDataManagement<Record<string, unknown>>(['a', 'b'], '|');
            expect(c.createIdentifier({ a: 'x', b: 'y' })).toBe('x|y');
        });

        it('order is significant: swapping the values changes the key', () => {
            const c = useStructureDataManagement<Record<string, unknown>>(['a', 'b'], '|');
            expect(c.createIdentifier({ a: 'x', b: 'y' })).not.toBe(
                c.createIdentifier({ a: 'y', b: 'x' })
            );
        });

        it('fills ONLY the missing identifier fields with a fallback, keeping the present ones', () => {
            const c = useStructureDataManagement<Record<string, unknown>>(['a', 'b'], '|');
            const item: Record<string, unknown> = { a: 'x' }; // b missing
            const id = c.createIdentifier(item) as string;

            expect(item.a).toBe('x'); // untouched
            expect(item.b).toBeDefined(); // filled
            expect(id).toBe(`x|${item.b}`);
            expect(warn).toHaveBeenCalled();
        });

        it('getRecord resolves a multi-identifier record by its parts', () => {
            const c = useStructureDataManagement<Record<string, unknown>>(['a', 'b'], '|');
            c.addRecord({ a: 'x', b: 'y', name: 'combo' });
            expect(c.getRecord('x' as never, 'y' as never)).toEqual({
                a: 'x',
                b: 'y',
                name: 'combo'
            });
        });
    });

    describe('addRecord with a missing identifier', () => {
        it('assigns a fallback id and exposes it via lastInsertedIdentifier/Record', () => {
            const c = useStructureDataManagement<IItem>('id');
            c.addRecord({ name: 'auto' });

            const id = c.lastInsertedIdentifier.value;
            expect(id).toBeDefined();
            expect(c.getRecord(id)).toEqual({ id, name: 'auto' });
            expect(c.lastInsertedRecord.value).toEqual({ id, name: 'auto' });
        });
    });

    describe('editRecord return value & guards', () => {
        it('returns the new id when it CREATED a record', () => {
            const c = useStructureDataManagement<IItem>('id');
            expect(c.editRecord({ id: 1, name: 'new' }, 1 as never)).toBe(1);
        });

        it('returns undefined when it only UPDATED an existing record', () => {
            const c = useStructureDataManagement<IItem>('id');
            c.addRecord({ id: 1, name: 'a' });
            expect(c.editRecord({ name: 'b' }, 1 as never)).toBeUndefined();
            expect(c.getRecord(1 as never)?.name).toBe('b');
        });

        it('create=false with no id: errors and is a no-op', () => {
            const c = useStructureDataManagement<IItem>('id');
            const result = c.editRecord({ name: 'x' }, undefined, false);
            expect(result).toBeUndefined();
            expect(error).toHaveBeenCalled();
            expect(c.itemList.value).toHaveLength(0);
        });

        it('create=false on a missing id: errors and does NOT create the record', () => {
            const c = useStructureDataManagement<IItem>('id');
            const result = c.editRecord({ name: 'x' }, 99 as never, false);
            expect(result).toBeUndefined();
            expect(error).toHaveBeenCalled();
            expect(c.getRecord(99 as never)).toBeUndefined();
        });
    });

    describe('editRecords (batch)', () => {
        it('records only the NEWLY inserted ids in lastInsertedIdentifiers', () => {
            const c = useStructureDataManagement<IItem>('id');
            c.addRecord({ id: 1, name: 'existing' });

            // 1 already exists (update, no id), 2 and 3 are new
            c.editRecords([
                { id: 1, name: 'updated' },
                { id: 2, name: 'two' },
                { id: 3, name: 'three' }
            ]);

            expect(c.lastInsertedIdentifiers.value).toEqual([2, 3]);
            expect(c.getRecord(1 as never)?.name).toBe('updated');
            expect(c.itemList.value).toHaveLength(3);
        });

        it('skips undefined entries', () => {
            const c = useStructureDataManagement<IItem>('id');
            c.editRecords([{ id: 1, name: 'a' }, undefined, { id: 2, name: 'b' }]);
            expect(c.lastInsertedIdentifiers.value).toEqual([1, 2]);
            expect(c.itemList.value).toHaveLength(2);
        });
    });

    describe('deleteRecord', () => {
        it('is a safe no-op for a non-existent id (no throw, dictionary unchanged)', () => {
            const c = useStructureDataManagement<IItem>('id');
            c.addRecord({ id: 1, name: 'a' });
            expect(() => c.deleteRecord(99 as never)).not.toThrow();
            expect(c.itemList.value).toHaveLength(1);
        });
    });
});
