import { useCoreStore } from '../src/stores/core';
import { resetStores } from '../src/utils/store';

describe('useCoreStore', () => {
    beforeEach(() => {
        resetStores();
    });

    it('starts with no loadings', () => {
        const store = useCoreStore();
        expect(store.isLoading).toBe(false);
    });

    it('sets a loading key to true', () => {
        const store = useCoreStore();
        store.setLoading('fetch', true);
        expect(store.getLoading('fetch')).toBe(true);
        expect(store.isLoading).toBe(true);
    });

    it('sets a loading key to false', () => {
        const store = useCoreStore();
        store.setLoading('fetch', true);
        store.setLoading('fetch', false);
        expect(store.getLoading('fetch')).toBe(false);
        expect(store.isLoading).toBe(false);
    });

    it('resets all loadings', () => {
        const store = useCoreStore();
        store.setLoading('a', true);
        store.setLoading('b', true);
        store.resetLoadings();
        expect(store.isLoading).toBe(false);
    });

    it('returns true when at least one loading is active', () => {
        const store = useCoreStore();
        store.setLoading('a', true);
        store.setLoading('b', false);
        expect(store.isLoading).toBe(true);
    });
});
