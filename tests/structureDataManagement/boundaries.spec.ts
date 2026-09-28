/**
 * UNIT — boundary guards of useStructureDataManagement.
 *   - a record with every identifier field present never generates a fallback id
 *   - writing the same `pageSize` does not notify watchers; a different one does
 */

import { watch } from 'vue';
import { useStructureDataManagement } from '../../src/composables/structureDataManagement';

describe('UNIT · structureDataManagement boundaries', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
        warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => warn.mockRestore());

    it('does not fill any identifier when all of them are present', () => {
        const c = useStructureDataManagement<Record<string, unknown>>(['a', 'b'], '|');
        const item = { a: 'x', b: 'y' };

        expect(c.createIdentifier(item)).toBe('x|y');
        expect(warn).not.toHaveBeenCalled();
        expect(item).toEqual({ a: 'x', b: 'y' });
    });

    it('notifies pageSize watchers only when the size actually changes', () => {
        const c = useStructureDataManagement<{ id: number }>('id');
        let fires = 0;
        const stop = watch(c.pageSize, () => void (fires += 1), { flush: 'sync' });

        c.pageSize.value = 10; // the default: same value
        expect(fires).toBe(0);

        c.pageSize.value = 10.5; // rounds down to the same 10
        expect(fires).toBe(0);

        c.pageSize.value = 20;
        expect(fires).toBe(1);
        stop();
    });
});
