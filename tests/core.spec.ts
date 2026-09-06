import { createPinia, setActivePinia } from 'pinia';
import { useCoreStore } from '../src/stores/core';

describe('useCoreStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('starts with no loadings', () => {
        const store = useCoreStore();
        expect(store.isLoading()).toBe(false);
    });

    it('sets a loading key to true', () => {
        const store = useCoreStore();
        store.setLoading('fetch', true);
        expect(store.getLoading('fetch')).toBe(true);
        expect(store.isLoading()).toBe(true);
    });

    it('sets a loading key to false', () => {
        const store = useCoreStore();
        store.setLoading('fetch', true);
        store.setLoading('fetch', false);
        expect(store.getLoading('fetch')).toBe(false);
        expect(store.isLoading()).toBe(false);
    });

    it('resets all loadings', () => {
        const store = useCoreStore();
        store.setLoading('a', true);
        store.setLoading('b', true);
        store.resetLoadings();
        expect(store.isLoading()).toBe(false);
    });

    it('returns true when at least one loading is active', () => {
        const store = useCoreStore();
        store.setLoading('a', true);
        store.setLoading('b', false);
        expect(store.isLoading()).toBe(true);
    });

    it('ignores active keys outside the given prefixes', () => {
        const store = useCoreStore();
        store.setLoading('cart', true);
        expect(store.isLoading(['accountProfile'])).toBe(false);
        expect(store.isLoading(['cart'])).toBe(true);
    });

    it('matches every key under a prefix, action postfixes included', () => {
        const store = useCoreStore();
        store.setLoading('accountProfile:avatar-upload', true);
        expect(store.isLoading(['account'])).toBe(true);
        expect(store.isLoading(['accountProfile:avatar-upload'])).toBe(true);
        expect(store.isLoading(['accountProfile:avatar-remove'])).toBe(false);
    });

    it('accepts several prefixes, any of which is enough', () => {
        const store = useCoreStore();
        store.setLoading('orders', true);
        expect(store.isLoading(['cart', 'orders'])).toBe(true);
        expect(store.isLoading(['cart', 'wishlist'])).toBe(false);
    });

    it('answers false for a prefix whose only key is inactive', () => {
        const store = useCoreStore();
        store.setLoading('cart', false);
        expect(store.isLoading(['cart'])).toBe(false);
    });

    it('matches a prefix only from the start of the key', () => {
        const store = useCoreStore();
        store.setLoading('my-account', true);
        expect(store.isLoading(['account'])).toBe(false);
    });
});
