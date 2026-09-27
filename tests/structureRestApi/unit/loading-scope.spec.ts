/**
 * UNIT — a resource's loading surface: `loading` (anything in flight) and `isLoading(key)`,
 * which matches a call's `key` by PREFIX, the same rule useIsLoading and the core store use.
 * Also: parent lists get `gcTime: Infinity` like records, so a relation outlives its watcher.
 */

import { computed } from 'vue';
import { makeComposable, clearAllInstances, flush } from '../_helpers/harness';
import { deferredApi } from '../_helpers/fakeApi';
import type { IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

describe('UNIT · loading', () => {
    it('loading is true while anything of the resource is in flight', async () => {
        const c = makeComposable<IUser, number>();
        const { call, control } = deferredApi<string>();

        const pending = c.fetchAny(call, { key: ['stats'] });
        await flush(1);
        expect(c.loading.value).toBe(true);

        control.resolve('done');
        await pending;
        await flush(1);
        expect(c.loading.value).toBe(false);
    });

    it('isLoading(key) matches a key prefix, on queries and mutations', async () => {
        const c = makeComposable<IUser, number>();
        const { call, control } = deferredApi<void>();
        const dash = computed(() => c.isLoading(['dash']));
        const exact = computed(() => c.isLoading(['dash', 'w1']));
        const other = computed(() => c.isLoading(['cart']));

        const pending = c.mutateAny(call, { key: ['dash', 'w1'] });
        await flush(1);

        expect(dash.value).toBe(true);
        expect(exact.value).toBe(true);
        expect(other.value).toBe(false);

        control.resolve();
        await pending;
        await flush(1);
        expect(dash.value).toBe(false);
    });
});

describe('UNIT · cache lifetime defaults', () => {
    it('records and parent lists never expire unobserved; other lists keep TanStack defaults', () => {
        const c = makeComposable<IUser, number>();
        const gcTimeOf = (key: unknown[]) => c.queryClient.getQueryDefaults(key).gcTime;

        expect(gcTimeOf(['resource', 'target', [], '1'])).toBe(Number.POSITIVE_INFINITY);
        expect(gcTimeOf(['resource', 'parent', [], 'team-1'])).toBe(Number.POSITIVE_INFINITY);
        expect(gcTimeOf(['resource', 'all', []])).toBeUndefined();
        expect(gcTimeOf(['resource', 'search', [], '{}', 10, 1])).toBeUndefined();
    });
});
