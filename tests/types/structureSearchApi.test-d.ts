/**
 * TYPES — useStructureSearchApi: search results and the watcher handle it adds on top of
 * useStructureRestApi.
 */
import { ref } from 'vue';
import { expectTypeOf } from 'expect-type';
import { useStructureSearchApi } from '../../src/index.js';
import type {
    IStructureSearchApi,
    ISearchFetchContext
} from '../../src/composables/structureSearchApi.js';
import type { IFetchContext } from '../../src/composables/structureRestApi.js';
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

// fetchSearch's apiCall receives the frozen search through its context (A3): filters/page/
// pageSize, typed off the call's own filters argument, plus the { signal } every read context has.
void search.fetchSearch((context: ISearchFetchContext<IUserFilters>) => {
    expectTypeOf(context.filters).toEqualTypeOf<IUserFilters>();
    expectTypeOf(context.page).toEqualTypeOf<number>();
    expectTypeOf(context.pageSize).toEqualTypeOf<number>();
    expectTypeOf(context.signal).toEqualTypeOf<AbortSignal>();
    return Promise.resolve({ items: [], totalItems: 0 });
}, { name: 'Ada' });

// An old-style apiCall typed on the plain { signal } context (pre-A3) still compiles: it is
// assignable wherever the richer ISearchFetchContext is expected — it just ignores the extras.
const oldStyleApiCall = (context: IFetchContext) => {
    expectTypeOf(context.signal).toEqualTypeOf<AbortSignal>();
    return Promise.resolve({ items: [], totalItems: 0 });
};
void search.fetchSearch(oldStyleApiCall, { name: 'Ada' });

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

// watchSearch's settings refuse a wrong type for a non-generic field.
search.watchSearch(() => Promise.resolve({ items: [], totalItems: 0 }), {
    staleTime: 1000,
    key: ['a']
});
// @ts-expect-error -- staleTime is a number, not a string
search.watchSearch(() => Promise.resolve({ items: [], totalItems: 0 }), { staleTime: 'nope' });
// @ts-expect-error -- key is a string[], not a bare string
search.watchSearch(() => Promise.resolve({ items: [], totalItems: 0 }), { key: 'nope' });

// checkSearch/isPageCached's settings: same key/staleTime typing.
search.checkSearch({}, 1, 10, { staleTime: 1000, key: ['a'] });
// @ts-expect-error -- staleTime is a number, not a string
search.checkSearch({}, 1, 10, { staleTime: 'nope' });
// @ts-expect-error -- isPageCached takes no filters/page/size, only settings
search.isPageCached({}, 1, 10);
