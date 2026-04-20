export const REF_SYMBOL = Symbol('react-toolkit-ref');

export interface IRef<T> {
    value: T;
    [REF_SYMBOL]: true;
}

export function ref<T>(initialValue: T): IRef<T>;
export function ref<T = undefined>(): IRef<T | undefined>;
export function ref<T>(initialValue?: T): IRef<T | undefined> {
    return { value: initialValue, [REF_SYMBOL]: true };
}

export const computed = <T>(getter: () => T): Readonly<IRef<T>> =>
    Object.defineProperties({} as IRef<T>, {
        value: {
            get: getter,
            enumerable: true
        },
        [REF_SYMBOL]: {
            value: true,
            enumerable: false
        }
    });
