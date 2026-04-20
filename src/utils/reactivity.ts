export interface IRef<T> {
    value: T;
}

export function ref<T>(initialValue: T): IRef<T>;
export function ref<T = undefined>(): IRef<T | undefined>;
export function ref<T>(initialValue?: T): IRef<T | undefined> {
    return { value: initialValue };
}

export const computed = <T>(getter: () => T): Readonly<IRef<T>> =>
    Object.defineProperty({} as IRef<T>, 'value', {
        get: getter,
        enumerable: true
    });
