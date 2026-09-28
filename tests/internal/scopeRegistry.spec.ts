/**
 * UNIT · internal/scopeRegistry.ts: claims are counted per scope, a release is one-shot, and a
 * scope stays live until every claim on it is released.
 */
import { QueryClient } from '@tanstack/vue-query';
import { scopeRegistryFor } from '../../src/internal/scopeRegistry';

describe('UNIT · scopeRegistryFor', () => {
    let queryClient: QueryClient;

    beforeEach(() => {
        queryClient = new QueryClient();
    });

    afterEach(() => {
        queryClient.clear();
    });

    it('an unclaimed scope is not live', () => {
        expect(scopeRegistryFor(queryClient, 'items').isLive(['a'])).toBe(false);
    });

    it('two claims need two releases before the scope drops', () => {
        const registry = scopeRegistryFor(queryClient, 'items');
        const releaseFirst = registry.claim(['a']);
        const releaseSecond = registry.claim(['a']);

        releaseFirst();
        expect(registry.isLive(['a'])).toBe(true);

        releaseSecond();
        expect(registry.isLive(['a'])).toBe(false);
    });

    it('a release called twice counts once', () => {
        const registry = scopeRegistryFor(queryClient, 'items');
        const releaseFirst = registry.claim(['a']);
        const releaseSecond = registry.claim(['a']);

        releaseFirst();
        releaseFirst();
        expect(registry.isLive(['a'])).toBe(true);

        releaseSecond();
        expect(registry.isLive(['a'])).toBe(false);
    });

    it('a release after the scope is gone is a no-op and does not resurrect a count', () => {
        const registry = scopeRegistryFor(queryClient, 'items');
        const release = registry.claim(['a']);
        release();
        release();
        expect(registry.isLive(['a'])).toBe(false);

        // A fresh claim starts from zero: one release drops it.
        const releaseAgain = registry.claim(['a']);
        expect(registry.isLive(['a'])).toBe(true);
        releaseAgain();
        expect(registry.isLive(['a'])).toBe(false);
    });

    it('scopes are matched by content and counted separately', () => {
        const registry = scopeRegistryFor(queryClient, 'items');
        const release = registry.claim([{ lang: 'en', user: 1 }]);

        expect(registry.isLive([{ user: 1, lang: 'en' }])).toBe(true);
        expect(registry.isLive([{ lang: 'it', user: 1 }])).toBe(false);
        release();
        expect(registry.isLive([{ lang: 'en', user: 1 }])).toBe(false);
    });

    it('registries of two resource keys, or two clients, do not share claims', () => {
        const other = new QueryClient();
        const registry = scopeRegistryFor(queryClient, 'items');
        registry.claim(['a']);

        expect(scopeRegistryFor(queryClient, 'other').isLive(['a'])).toBe(false);
        expect(scopeRegistryFor(other, 'items').isLive(['a'])).toBe(false);
        // The same pair resolves to the same registry state.
        expect(scopeRegistryFor(queryClient, 'items').isLive(['a'])).toBe(true);
        other.clear();
    });
});
