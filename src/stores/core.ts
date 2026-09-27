/**
 * App-wide loading flags in one Pinia setup store.
 *
 * - A flat map of string key -> boolean, so components, guards and composables share one source.
 * - Keys are namespaced by owner and action ('accountProfile:avatar-upload'); `isLoading` asks
 *   by key PREFIX, so one question can cover a module, a screen or a single button.
 *
 * @module stores/core
 * @see docs/stores/core.md
 */
import { ref } from 'vue';
import { defineStore } from 'pinia';
import { matchesAnyPrefix } from '../internal/plainData.js';

/**
 * Global loading state, readable from components, guards and composables alike.
 *
 * Pinia: `'core'` is the store id (devtools label, SSR state key); the function is a setup store.
 *
 * @returns `loadings` plus `setLoading`, `getLoading`, `isLoading` and `resetLoadings`
 */
export const useCoreStore = defineStore('core', () => {
    /**
     * Loading flags by key. A missing key reads as "not loading".
     */
    const loadings = ref<Record<string, boolean>>({});

    /**
     * Sets one loading flag.
     *
     * @param key   - namespaced flag name, e.g. 'accountProfile:avatar-upload'
     * @param value - whether that work is in progress
     * @returns the value just stored
     */
    const setLoading = (key = '', value = false) => (loadings.value[key] = value);

    /**
     * Clears every loading flag.
     *
     * @returns the new, empty map
     */
    const resetLoadings = () => (loadings.value = {});

    /**
     * Reads one loading flag by its exact key.
     *
     * @param key - the flag to read; unknown keys read as false
     */
    const getLoading = (key = '') => !!loadings.value[key];

    /**
     * Checks whether anything under the given prefixes is loading.
     *
     * A plain function, not a computed, because the answer depends on the prefixes asked
     * about — call it inside a computed to track it.
     *
     * @param prefixes - key prefixes to match ('accountProfile' matches
     *                   'accountProfile:avatar-upload'); empty = any key at all
     */
    const isLoading = (prefixes: string[] = []) =>
        Object.entries(loadings.value).some(
            ([key, value]) => value && matchesAnyPrefix(key, prefixes)
        );

    return {
        loadings,
        isLoading,
        resetLoadings,
        setLoading,
        getLoading
    };
});
