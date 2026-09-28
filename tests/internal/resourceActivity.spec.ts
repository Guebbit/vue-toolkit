/**
 * UNIT · internal/resourceActivity.ts: the data counter and the status counters move for the
 * events of their own resource only, hydration included, and stop with the owning scope.
 * Status counters are observed through a computed that counts how often it re-evaluates.
 */
import { computed, effectScope, type EffectScope } from 'vue';
import { dehydrate, hydrate, QueryClient } from '@tanstack/vue-query';
import { useResourceActivity } from '../../src/internal/resourceActivity';

describe('UNIT · useResourceActivity', () => {
    let queryClient: QueryClient;
    let scope: EffectScope;
    let activity: ReturnType<typeof useResourceActivity>;
    let evaluations: number;
    let watched: { value: boolean };
    const pending: (() => void)[] = [];

    /** Runs a mutation of `mutationKey` that stays pending until `afterEach`. */
    const startMutation = (mutationKey?: string[]) => {
        const gate = Promise.withResolvers<void>();
        pending.push(gate.resolve);
        const mutation = queryClient
            .getMutationCache()
            .build(queryClient, { mutationKey, mutationFn: () => gate.promise });
        mutation.execute(undefined).catch(() => 0);
    };

    beforeEach(() => {
        queryClient = new QueryClient();
        scope = effectScope();
        activity = scope.run(() => useResourceActivity(queryClient, 'items', (id) => id))!;
        evaluations = 0;
        watched = computed(() => {
            evaluations++;
            return activity.isLoading();
        });
        void watched.value;
    });

    afterEach(() => {
        for (const resolve of pending.splice(0)) resolve();
        scope.stop();
        queryClient.clear();
    });

    it('5.1 a query added already holding data (hydrate) bumps the data counter', () => {
        const source = new QueryClient();
        source.setQueryData(['items', 'target', [], '1'], { data: 'x' });
        const before = activity.version('target').value;

        hydrate(queryClient, dehydrate(source));

        expect(activity.version('target').value).toBeGreaterThan(before);
        source.clear();
    });

    it('5.2 a query added with no data does not bump the data counter', () => {
        const before = activity.version('target').value;

        queryClient.getQueryCache().build(queryClient, {
            queryKey: ['items', 'target', [], '1'],
            queryFn: () => 'x'
        });

        expect(activity.version('target').value).toBe(before);
    });

    it('5.3 removing a query bumps the data counter', () => {
        queryClient.setQueryData(['items', 'target', [], '1'], { data: 'x' });
        const before = activity.version('target').value;

        queryClient.removeQueries({ queryKey: ['items', 'target'] });

        expect(activity.version('target').value).toBeGreaterThan(before);
    });

    it('a data write bumps its own kind and no other', () => {
        const others = activity.version('all').value;
        queryClient.setQueryData(['items', 'target', [], '1'], { data: 'x' });

        expect(activity.version('target').value).toBeGreaterThan(0);
        expect(activity.version('all').value).toBe(others);
    });

    it('5.4 a query of another resourceKey bumps neither counter', () => {
        const before = activity.version('target').value;

        queryClient.setQueryData(['other', 'target', [], '1'], { data: 'x' });
        void watched.value;

        expect(activity.version('target').value).toBe(before);
        expect(evaluations).toBe(1);
    });

    it('a query of this resource re-evaluates the status readers', () => {
        queryClient.setQueryData(['items', 'target', [], '1'], { data: 'x' });
        void watched.value;

        expect(evaluations).toBe(2);
    });

    it('5.5 a mutation of another resourceKey, or with no mutationKey, leaves mutationStatus alone', () => {
        startMutation(['other', 'update', '1']);
        startMutation();
        void watched.value;

        expect(evaluations).toBe(1);
    });

    it('a mutation of this resource re-evaluates the status readers', () => {
        startMutation(['items', 'update', '1']);
        void watched.value;

        expect(evaluations).toBeGreaterThan(1);
    });

    it('5.6 disposing the owning scope stops both subscriptions', () => {
        scope.stop();
        const before = activity.version('target').value;

        queryClient.setQueryData(['items', 'target', [], '1'], { data: 'x' });
        startMutation(['items', 'update', '1']);
        void watched.value;

        expect(activity.version('target').value).toBe(before);
        expect(evaluations).toBe(1);
    });

    it('5.7 isSaving ignores a pending mutation of another resource', () => {
        startMutation(['other', 'update', '1']);
        expect(activity.isSaving(1)).toBe(false);

        startMutation(['items', 'update', '1']);
        expect(activity.isSaving(1)).toBe(true);
        expect(activity.isSaving(2)).toBe(false);
    });
});
