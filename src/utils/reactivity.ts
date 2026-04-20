export interface IRef<T> {
    value: T;
}

export const ref = <T>(initialValue: T): IRef<T> => ({ value: initialValue });

export const computed = <T>(getter: () => T): Readonly<IRef<T>> =>
    Object.defineProperty({} as IRef<T>, 'value', {
        get: getter,
        enumerable: true
    });
