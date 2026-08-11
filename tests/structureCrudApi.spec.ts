/* eslint-disable @typescript-eslint/no-explicit-any */

import { nextTick, ref } from 'vue';
import {
    useStructureCrudApi,
    type IStructureCrudOperations
} from '../src/composables/structureCrudApi';
import { clearAllInstances, track } from './structureRestApi/_helpers/harness';

interface IProduct {
    id: string;
    title: string;
    price?: number;
}

interface IProductFilters {
    text?: string;
}

/**
 * Update payload of a multipart form: carries a `File` the record itself has no business holding.
 */
interface IProductUpdate {
    title?: string;
    imageUpload?: { name: string };
}

const PRODUCT: IProduct = { id: 'p1', title: 'First', price: 10 };
const OTHER: IProduct = { id: 'p2', title: 'Second', price: 20 };

/**
 * A read-only resource: the methods with no counterpart must fail in a way that names what is
 * missing, rather than deeper down with a less obvious message.
 */
const makeReadOnly = () =>
    track(
        useStructureCrudApi<IProduct, string, IProductFilters>(
            { list: jest.fn().mockResolvedValue([PRODUCT]) },
            { identifiers: 'id' }
        )
    );

/**
 * Builds a tracked composable over spied operations, so every test can assert both what the
 * store ended up holding and which call was made to get there.
 */
const makeCrud = (
    overrides: Partial<IStructureCrudOperations<IProduct, string, IProductFilters, any, any>> = {}
) => {
    const operations = {
        list: jest.fn().mockResolvedValue([PRODUCT, OTHER]),
        search: jest.fn().mockResolvedValue([PRODUCT]),
        get: jest.fn().mockResolvedValue(PRODUCT),
        create: jest.fn().mockResolvedValue(PRODUCT),
        update: jest.fn().mockResolvedValue({ ...PRODUCT, title: 'Updated' }),
        remove: jest.fn().mockResolvedValue({ deleted: true }),
        ...overrides
    };
    const api = track(
        useStructureCrudApi<IProduct, string, IProductFilters, any, any>(operations, {
            identifiers: 'id',
            TTL: 3_600_000
        })
    );
    return { api, operations };
};

describe('useStructureCrudApi', () => {
    afterEach(clearAllInstances);

    // ─── pass-through ─────────────────────────────────────────────────────────

    describe('the underlying search api', () => {
        it('is passed through, so nothing is given up by using this layer', () => {
            const { api } = makeCrud();
            // A representative member of each layer it is built on.
            expect(api.itemDictionary).toBeDefined(); // dataManagement
            expect(api.fetchTarget).toBeDefined(); // restApi
            expect(api.searchGet).toBeDefined(); // searchApi
            expect(api.pageCurrent).toBeDefined();
        });
    });

    // ─── filters ──────────────────────────────────────────────────────────────

    describe('filters', () => {
        it('starts empty', () => {
            const { api } = makeCrud();
            expect(api.filters.value).toEqual({});
        });

        it('starts from initialFilters when given', () => {
            const api = track(
                useStructureCrudApi<IProduct, string, IProductFilters>(
                    {},
                    { identifiers: 'id', initialFilters: { text: 'seed' } }
                )
            );
            expect(api.filters.value).toEqual({ text: 'seed' });
        });

        it('is the source the search reads, so an edit reaches the next search', async () => {
            const { api, operations } = makeCrud();
            api.filters.value = { text: 'chair' };

            await api.searchNow();

            expect(operations.search).toHaveBeenCalledWith({ text: 'chair' }, 1, 10);
        });

        it('does not search on its own when edited', async () => {
            const { api, operations } = makeCrud();
            api.watchList();
            await nextTick();
            operations.search.mockClear();

            api.filters.value = { text: 'chair' };
            await nextTick();

            // As-you-type vs on-submit is the screen's decision, not the resource's.
            expect(operations.search).not.toHaveBeenCalled();
        });
    });

    // ─── fetchList ────────────────────────────────────────────────────────────

    describe('fetchList', () => {
        it('stores every record', async () => {
            const { api } = makeCrud();
            await api.fetchList();
            expect(api.itemList.value).toEqual([PRODUCT, OTHER]);
        });

        it('forwards its settings', async () => {
            const { api, operations } = makeCrud();
            await api.fetchList();
            await api.fetchList({ forced: true });
            expect(operations.list).toHaveBeenCalledTimes(2);
        });

        it('serves a second call from cache without settings', async () => {
            const { api, operations } = makeCrud();
            await api.fetchList();
            await api.fetchList();
            expect(operations.list).toHaveBeenCalledTimes(1);
        });
    });

    // ─── search ───────────────────────────────────────────────────────────────

    describe('watchList', () => {
        it('searches immediately', async () => {
            const { api, operations } = makeCrud();
            api.watchList();
            await nextTick();
            expect(operations.search).toHaveBeenCalledWith({}, 1, 10);
        });

        it('re-searches when the page changes', async () => {
            const { api, operations } = makeCrud();
            api.watchList();
            await nextTick();

            api.pageCurrent.value = 2;
            await nextTick();

            expect(operations.search).toHaveBeenLastCalledWith({}, 2, 10);
        });

        it('reports failures through onError instead of swallowing them', async () => {
            const reason = new Error('search failed');
            const onError = jest.fn();
            const { api } = makeCrud({ search: jest.fn().mockRejectedValue(reason) });

            const { search } = api.watchList({ onError });
            await search();

            expect(onError).toHaveBeenCalledWith(reason, {});
        });

        it('scopes pageItemList to the current search', async () => {
            const { api } = makeCrud();
            const { search } = api.watchList();
            await search();
            expect(api.pageItemList.value).toEqual([PRODUCT]);
        });
    });

    describe('searchNow', () => {
        it('goes back to page one, so the Search button always does something', async () => {
            const { api, operations } = makeCrud();
            api.pageCurrent.value = 4;

            await api.searchNow();

            expect(api.pageCurrent.value).toBe(1);
            expect(operations.search).toHaveBeenCalledWith({}, 1, 10);
        });
    });

    describe('resetFilters', () => {
        it('clears the filters and searches again', async () => {
            const { api, operations } = makeCrud();
            api.filters.value = { text: 'chair' };

            await api.resetFilters();

            expect(api.filters.value).toEqual({});
            expect(operations.search).toHaveBeenLastCalledWith({}, 1, 10);
        });

        it('returns to initialFilters, not to empty, when the resource has defaults', async () => {
            const search = jest.fn().mockResolvedValue([]);
            const api = track(
                useStructureCrudApi<IProduct, string, IProductFilters>(
                    { search },
                    { identifiers: 'id', initialFilters: { text: 'seed' } }
                )
            );
            api.filters.value = { text: 'chair' };

            await api.resetFilters();

            expect(api.filters.value).toEqual({ text: 'seed' });
        });

        it('bypasses the cache, because Reset is a request for the truth', async () => {
            const { api, operations } = makeCrud();
            await api.searchNow();
            operations.search.mockClear();

            await api.resetFilters();

            expect(operations.search).toHaveBeenCalledTimes(1);
        });
    });

    describe('fetchPage', () => {
        it('fetches an unfiltered page', async () => {
            const { api, operations } = makeCrud();
            await api.fetchPage(3, 25);
            expect(operations.search).toHaveBeenCalledWith({}, 3, 25);
        });

        it('leaves the shared search state alone', async () => {
            const { api } = makeCrud();
            api.pageCurrent.value = 2;
            await api.fetchPage(3, 25);
            expect(api.pageCurrent.value).toBe(2);
        });
    });

    // ─── one record ───────────────────────────────────────────────────────────

    describe('fetchOne', () => {
        it('stores the record and selects it', async () => {
            const { api } = makeCrud();
            await api.fetchOne('p1');
            expect(api.selectedRecord.value).toEqual(PRODUCT);
        });

        it('selects before fetching, so a cached record renders without a blank frame', () => {
            const { api } = makeCrud();
            void api.fetchOne('p1');
            expect(api.selectedIdentifier.value).toBe('p1');
        });

        it('undoes the selection when the fetch fails', async () => {
            const { api } = makeCrud({ get: jest.fn().mockRejectedValue(new Error('404')) });
            await expect(api.fetchOne('p1')).rejects.toThrow('404');
            expect(api.selectedIdentifier.value).toBeUndefined();
        });

        it('forwards the id to the operation', async () => {
            const { api, operations } = makeCrud();
            await api.fetchOne('p1');
            expect(operations.get).toHaveBeenCalledWith('p1');
        });
    });

    describe('watchOne', () => {
        it('fetches immediately and again whenever the id changes', async () => {
            const { api, operations } = makeCrud();
            const id = ref<string | undefined>('p1');

            api.watchOne(id);
            await nextTick();
            await nextTick();

            id.value = 'p2';
            await nextTick();
            await nextTick();

            expect(operations.get).toHaveBeenCalledWith('p1');
            expect(operations.get).toHaveBeenCalledWith('p2');
        });
    });

    // ─── mutations ────────────────────────────────────────────────────────────

    describe('createOne', () => {
        it('stores the created record', async () => {
            const { api } = makeCrud();
            await api.createOne({ title: 'First' });
            expect(api.getRecord('p1')).toEqual(PRODUCT);
        });

        it('forwards per-call options to the operation', async () => {
            const { api, operations } = makeCrud();
            const options = { signal: 'abort-signal' };
            await api.createOne({ title: 'First' }, options);
            expect(operations.create).toHaveBeenCalledWith({ title: 'First' }, options);
        });
    });

    describe('updateOne', () => {
        it('applies the change locally before the request goes out', async () => {
            // Observed from inside the pending request rather than after N microtasks: how long
            // updateTarget's cancel-then-write takes is TanStack's business, but that the local
            // record is already updated by the time the request is sent is the actual contract.
            const update = jest.fn();
            const { api } = makeCrud({ update });
            let titleWhenSent: string | undefined;
            update.mockImplementation(() => {
                titleWhenSent = api.getRecord('p1')?.title;
                return Promise.resolve({ ...PRODUCT, title: 'Updated' });
            });
            await api.fetchOne('p1');

            await api.updateOne('p1', { title: 'Optimistic' });

            expect(titleWhenSent).toBe('Optimistic');
        });

        it('rolls back when the request fails', async () => {
            const { api } = makeCrud({ update: jest.fn().mockRejectedValue(new Error('nope')) });
            await api.fetchOne('p1');

            await expect(api.updateOne('p1', { title: 'Optimistic' })).rejects.toThrow('nope');

            expect(api.getRecord('p1')?.title).toBe('First');
        });

        it('forwards per-call options to the operation', async () => {
            const { api, operations } = makeCrud();
            const options = { onUploadProgress: jest.fn() };
            await api.updateOne('p1', { title: 'Updated' }, options);
            expect(operations.update).toHaveBeenCalledWith('p1', { title: 'Updated' }, options);
        });

        // ── optimisticPatch ──
        it('stores the payload itself as the patch by default', async () => {
            const { api } = makeCrud();
            await api.fetchOne('p1');
            await api.updateOne('p1', { title: 'Updated' });
            expect(api.getRecord('p1')?.title).toBe('Updated');
        });

        it('keeps a File out of the record when optimisticPatch strips it', async () => {
            const update = jest.fn();
            const { api } = makeCrud({
                update,
                optimisticPatch: ({ imageUpload: _dropped, ...fields }: IProductUpdate) => fields
            });
            let recordWhenSent: IProduct | undefined;
            update.mockImplementation(() => {
                recordWhenSent = { ...api.getRecord('p1')! };
                return Promise.resolve({ ...PRODUCT, title: 'Updated' });
            });
            await api.fetchOne('p1');

            await api.updateOne('p1', {
                title: 'Optimistic',
                imageUpload: { name: 'photo.png' }
            });

            // The server answers with a URL; parking a Blob in store state until it does is nonsense.
            expect(recordWhenSent).not.toHaveProperty('imageUpload');
            expect(recordWhenSent?.title).toBe('Optimistic');
        });
    });

    describe('deleteOne', () => {
        it('drops the record', async () => {
            const { api } = makeCrud();
            await api.fetchOne('p1');
            await api.deleteOne('p1');
            expect(api.getRecord('p1')).toBeUndefined();
        });

        it('forwards the id to the operation', async () => {
            const { api, operations } = makeCrud();
            await api.deleteOne('p1');
            expect(operations.remove).toHaveBeenCalledWith('p1', undefined);
        });
    });

    // ─── missing operations ───────────────────────────────────────────────────

    describe('operations that were not supplied', () => {
        it.each([
            ['get', (api: any) => api.fetchOne('p1')],
            ['create', (api: any) => api.createOne({ title: 'x' })],
            ['update', (api: any) => api.updateOne('p1', { title: 'x' })],
            ['remove', (api: any) => api.deleteOne('p1')],
            ['search', (api: any) => api.searchNow()],
            ['search', (api: any) => api.fetchPage()]
        ])('rejects naming the missing "%s" operation', async (operation, call) => {
            const api = makeReadOnly();
            await expect(call(api)).rejects.toThrow(
                `useStructureCrudApi - no "${operation}" operation was supplied`
            );
        });

        it('still serves the operations that were supplied', async () => {
            const api = makeReadOnly();
            await expect(api.fetchList()).resolves.toEqual([PRODUCT]);
        });
    });
});
