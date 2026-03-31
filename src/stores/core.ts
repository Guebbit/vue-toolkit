import { ref, computed } from 'vue';
import { defineStore } from 'pinia';

export const useCoreStore = defineStore('core', () => {
    /**
     * This loading must be accessed from anywhere.
     * Components, guards and so on.
     */
    const loadings = ref<Record<string | symbol, boolean>>({});

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
     * Check if there are any loadings
     */
    const isLoading = computed(() => Object.values(loadings.value).some(Boolean));

    return {
        loadings,
        isLoading,
        resetLoadings,
        setLoading,
        getLoading
    };
});
