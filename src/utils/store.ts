import { REF_SYMBOL, type IRef } from './reactivity';

type StoreSetupResult = Record<string, unknown>;
const storeRegistry = new Map<string, StoreSetupResult>();

const isRefLike = (value: unknown): value is IRef<unknown> =>
    typeof value === 'object' && value !== null && REF_SYMBOL in value;

const unwrapStore = <T extends StoreSetupResult>(store: T): T => {
    const unwrappedStore = {} as T;

    for (const [key, value] of Object.entries(store)) {
        if (isRefLike(value)) {
            Object.defineProperty(unwrappedStore, key, {
                get() {
                    return value.value;
                },
                set(nextValue) {
                    value.value = nextValue;
                },
                enumerable: true,
                configurable: true
            });
            continue;
        }

        if (typeof value === 'function') {
            (unwrappedStore as Record<string, unknown>)[key] = (
                value as (...arguments_: unknown[]) => unknown
            ).bind(store);
            continue;
        }

        (unwrappedStore as Record<string, unknown>)[key] = value;
    }

    return unwrappedStore;
};

export const defineStore = <T extends StoreSetupResult>(
    name: string,
    setup: () => T
): (() => T) => {
    return () => {
        if (!storeRegistry.has(name)) storeRegistry.set(name, unwrapStore(setup()));
        return storeRegistry.get(name)! as T;
    };
};

export const resetStores = () => {
    storeRegistry.clear();
};
