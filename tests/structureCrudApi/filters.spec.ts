/**
 * CRUD — the live `filters` and `initialFilters` never share objects.
 *
 * A form edits `filters` in place. If `filters` wrapped the `initialFilters` object itself, every
 * keystroke would also rewrite the "initial" value, and resetFilters() would reset to whatever
 * the user last typed.
 */

import {
    useStructureCrudApi,
    type IStructureCrudOperations
} from '../../src/composables/structureCrudApi';
import {
    clearAllInstances,
    flush,
    newTestClient,
    runTracked
} from '../structureRestApi/_helpers/harness';

afterEach(clearAllInstances);

interface IProduct {
    id: string;
    title: string;
}

interface IProductFilters {
    text?: string;
    tags?: string[];
}

/**
 * A CRUD resource over a spied search operation.
 *
 * @param initialFilters - the resource's initial filters
 */
const makeCrud = (initialFilters: IProductFilters) => {
    const operations: IStructureCrudOperations<IProduct, string, IProductFilters> = {
        search: jest.fn(() => Promise.resolve({ items: [], totalItems: 0 }))
    };
    const api = runTracked(() =>
        useStructureCrudApi<IProduct, string, IProductFilters>(operations, {
            resourceKey: 'products',
            queryClient: newTestClient(),
            initialFilters
        })
    );
    return { api, operations };
};

describe('CRUD · filters', () => {
    it('resetFilters() returns to the initial filters after in-place edits', async () => {
        const initialFilters = { text: '', tags: ['new'] };
        const { api } = makeCrud(initialFilters);

        api.filters.value.text = 'typed';
        api.filters.value.tags!.push('sale');
        await api.resetFilters();

        expect(api.filters.value).toEqual({ text: '', tags: ['new'] });
        expect(initialFilters).toEqual({ text: '', tags: ['new'] });
    });

    it('typing into the filters while watchList runs sends no request', async () => {
        const { api, operations } = makeCrud({ text: '' });
        api.watchList();
        await flush();
        expect(operations.search).toHaveBeenCalledTimes(1);

        api.filters.value.text = 'a';
        await flush();
        api.filters.value.text = 'ab';
        await flush();

        expect(operations.search).toHaveBeenCalledTimes(1);
    });
});
