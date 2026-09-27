/**
 * UNIT — fetchTarget by an alternate key (VD3): the record is stored once, under its own id.
 *
 * `fetchTarget(apiCall, 'my-slug')` resolving `{ id: 7 }` used to store the answer under BOTH
 * `'my-slug'` (what TanStack writes back under the key it fetched) and `7` (what `targetQueryFunction`
 * itself wrote) — two independent, divergent copies of the same record. The requested key now holds
 * an alias entry instead (`{ aliasOf: 7 }`); `getRecord`/`selectedRecord` follow it one hop, and
 * `itemDictionary`/`itemList` never see it as a second record.
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';

afterEach(clearAllInstances);

interface ISlugged {
    id: number;
    name: string;
}

const make = () => makeComposable<ISlugged, number | string>();

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
