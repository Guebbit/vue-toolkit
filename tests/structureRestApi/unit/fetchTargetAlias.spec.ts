/**
 * UNIT — fetchTarget by an alternate key: the record is stored once, under its own id.
 *
 * `fetchTarget(apiCall, 'my-slug')` resolving `{ id: 7 }` must not store the answer under BOTH
 * `'my-slug'` (what TanStack writes back under the key it fetched) and `7` (what
 * `targetQueryFunction` writes) — two independent, divergent copies of the same record. The
 * requested key holds an alias entry instead (`{ aliasOf: 7 }`); `getRecord`/`selectedRecord`
 * follow it one hop, and `itemDictionary`/`itemList` never see it as a second record.
 *
 * Writes by the alias (`updateTarget`, `deleteTarget`, `editRecord`, `deleteRecord`) reach the
 * record it points at, and an alias whose record is gone is no cache hit.
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';

afterEach(clearAllInstances);

interface ISlugged {
    id: number;
    name: string;
}

const make = () => makeComposable<ISlugged, number | string>();

/** A resource holding record 7, fetched by its slug. */
const seeded = async () => {
    const c = make();
    await c.fetchTarget(() => Promise.resolve({ id: 7, name: 'Alice' }), 'my-slug');
    return c;
};

describe('UNIT · fetchTarget by an alternate key', () => {
    it('stores the record once, under its own id, with the requested key as an alias', async () => {
        const c = make();
        const item: ISlugged = { id: 7, name: 'Alice' };

        const result = await c.fetchTarget(() => Promise.resolve(item), 'my-slug');

        expect(result).toEqual(item);
        expect(c.getRecord(7)).toEqual(item);
        expect(c.getRecord('my-slug')).toEqual(item); // follows the alias
        expect(c.itemList.value).toEqual([item]); // one record, not two
    });

    it("the alias stays in sync with the record's own id: it is a pointer, not a copy", async () => {
        const c = make();
        await c.fetchTarget(() => Promise.resolve({ id: 7, name: 'Alice' }), 'my-slug');

        c.editRecord({ name: 'Alice Edited' }, 7);

        expect(c.getRecord('my-slug')?.name).toBe('Alice Edited');
    });

    it('fetching directly by the real id after an alias fetch does not create a second record', async () => {
        const c = make();
        await c.fetchTarget(() => Promise.resolve({ id: 7, name: 'Alice' }), 'my-slug');
        await c.fetchTarget(() => Promise.resolve({ id: 7, name: 'Alice' }), 7);

        expect(c.itemList.value).toHaveLength(1);
    });
});

describe('UNIT · writes by an alternate key', () => {
    it('updateTarget by the alias edits the record it points at, not a second one', async () => {
        const c = await seeded();

        await c.updateTarget(
            () => Promise.resolve({ id: 7, name: 'Alice Edited' }),
            { name: 'Alice Edited' },
            'my-slug'
        );

        expect(c.itemList.value).toEqual([{ id: 7, name: 'Alice Edited' }]);
    });

    it('deleteTarget by the alias removes the record it points at', async () => {
        const c = await seeded();

        await c.deleteTarget(() => Promise.resolve({ ok: true }), 'my-slug');

        expect(c.getRecord(7)).toBeUndefined();
    });

    it('editRecord by the alias edits the record it points at, not a second one', async () => {
        const c = await seeded();

        c.editRecord({ name: 'Alice Edited' }, 'my-slug');

        expect(c.itemList.value).toEqual([{ id: 7, name: 'Alice Edited' }]);
    });

    it('deleteRecord by the alias removes the record it points at', async () => {
        const c = await seeded();

        c.deleteRecord('my-slug');

        expect(c.getRecord(7)).toBeUndefined();
    });

    it('once the record it points at is deleted, a read by the alias asks the server again', async () => {
        const c = await seeded();
        await c.deleteTarget(() => Promise.resolve({ ok: true }), 7);

        // the slug may now name another record
        const get = jest.fn(() => Promise.resolve({ id: 8, name: 'Bob' }));
        await c.fetchTarget(get, 'my-slug');

        expect(get).toHaveBeenCalledTimes(1);
    });
});
