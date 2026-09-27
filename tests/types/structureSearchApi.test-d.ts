/**
 * TYPES — useStructureSearchApi: search results and the watcher handle it adds on top of
 * useStructureRestApi.
 */
import { ref } from 'vue';
import { expectTypeOf } from 'expect-type';
import { useStructureSearchApi } from '../../src/index.js';
import type { IStructureSearchApi } from '../../src/composables/structureSearchApi.js';
import type { IUser } from './_fixtures.js';

interface IUserFilters {
    name?: string;
}

const filters = ref<IUserFilters>({});
const search = useStructureSearchApi<IUser, number, string | number, IUserFilters>(filters, {
    resourceKey: 'users'
});

// IStructureSearchApi (V2.8): an explicit, exported return interface, not inferred.
expectTypeOf(search).toEqualTypeOf<
    IStructureSearchApi<IUser, number, string | number, IUserFilters>
>();

// fetchSearch/searchGet resolve/return records of T, and totalItems is a plain number.
expectTypeOf(
    search.fetchSearch(() => Promise.resolve({ items: [], totalItems: 0 }), { name: 'Ada' })
).toEqualTypeOf<Promise<{ items: (IUser | undefined)[]; totalItems: number }>>();
expectTypeOf(search.totalItems.value).toEqualTypeOf<number>();
expectTypeOf(search.pageItemList.value).toEqualTypeOf<IUser[]>();

// watchSearch's handle: stop/refetch/error plus search(). Its apiCall's last argument is the
// { signal } read context (V2.1).
const handle = search.watchSearch((watchedFilters, page, pageSize, context) => {
    expectTypeOf(watchedFilters).toEqualTypeOf<IUserFilters>();
    expectTypeOf(page).toEqualTypeOf<number>();
    expectTypeOf(pageSize).toEqualTypeOf<number>();
    expectTypeOf(context.signal).toEqualTypeOf<AbortSignal>();
    return Promise.resolve({ items: [], totalItems: 0 });
});
expectTypeOf(handle.search).returns.toEqualTypeOf<
    Promise<{ items: (IUser | undefined)[]; totalItems: number } | undefined>
>();
expectTypeOf(handle.stop).toEqualTypeOf<() => void>();
