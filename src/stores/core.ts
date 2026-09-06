import { ref } from 'vue';
import { defineStore } from 'pinia';

export const useCoreStore = defineStore('core', () => {
    /**
     * This loading must be accessed from anywhere.
     * Components, guards and so on.
     */
    const loadings = ref<Record<string, boolean>>({});

    /**
     * Set loading value
     *
     * @param key
     * @param value
     */
    const setLoading = (key = '', value = false) => (loadings.value[key] = value);

    /**
     * Reset all loadings
     */
    const resetLoadings = () => (loadings.value = {});

    /**
     * Check if there is a specific loading
     */
    const getLoading = (key = '') => !!loadings.value[key];

    /**
     * Check if anything is loading.
     *
     * Prefixes scope the question: keys are namespaced by their owner ('accountProfile') and
     * their action ('accountProfile:avatar-upload'), so a caller asks about one module, one
     * screen or one button instead of the whole app. No prefixes: any key at all.
     *
     * A plain function, not a computed, because the answer depends on the prefixes asked
     * about — call it inside a computed to track it.
     *
     * @param prefixes
     */
    const isLoading = (prefixes: string[] = []) =>
        Object.entries(loadings.value).some(
            ([key, value]) =>
                value &&
                (prefixes.length === 0 || prefixes.some((prefix) => key.startsWith(prefix)))
        );

    return {
        loadings,
        isLoading,
        resetLoadings,
        setLoading,
        getLoading
    };
});
