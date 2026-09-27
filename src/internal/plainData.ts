/**
 * Identity and copying for plain-data values: filters, `dependsOn` snapshots, key segments.
 *
 * `stableKey` turns a value into a canonical string, so two values compare by content rather
 * than by reference. `detachedCopy` rebuilds a value so that later edits to the source (a form
 * bound to it, say) can never reach the copy.
 *
 * @module internal/plainData
 */
import { toRaw } from 'vue';
import { canonicalize } from '@guebbit/js-toolkit';

/**
 * Canonical string for a plain value: property order never changes it, and `undefined`
 * properties are ignored (see `canonicalize`).
 *
 * @param value - any JSON-like value: objects, arrays, primitives, Dates
 * @returns the canonical JSON string
 */
export const stableKey = (value: unknown): string => JSON.stringify(canonicalize(value));

/**
 * True when `key` begins with every segment of `prefix`, in order: `['dash']` matches
 * `['dash', 'w1']`. An empty prefix matches anything, a missing key included.
 *
 * @param key - the key being tested
 * @param prefix - the segments it must start with
 * @returns whether `key` starts with `prefix`
 */
export const hasKeyPrefix = (
    key: readonly unknown[] | undefined,
    prefix: readonly unknown[]
): boolean => prefix.every((segment, index) => key?.[index] === segment);

/**
 * True for a plain object literal (or a null-prototype object): what `detachedCopy` rebuilds.
 *
 * @param value - the value being tested
 * @returns whether `value` is a plain object
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (typeof value !== 'object' || value === null) return false;
    const prototype = Object.getPrototypeOf(value) as unknown;
    return prototype === Object.prototype || prototype === null;
};

/**
 * Copy of `value` with every plain object and array rebuilt, and Vue proxies unwrapped on the
 * way. Anything else (Dates, class instances) is kept by reference.
 *
 * @param value - the data to copy
 * @returns a copy sharing no plain object or array with `value`
 */
export const detachedCopy = <V>(value: V): V => {
    const raw = toRaw(value);
    if (Array.isArray(raw)) return raw.map((item: unknown) => detachedCopy(item)) as V;
    if (!isPlainObject(raw)) return raw;
    return Object.fromEntries(
        Object.entries(raw).map(([key, item]) => [key, detachedCopy(item)])
    ) as V;
};

/**
 * True when `value` is a string starting with one of `prefixes`, or there are no prefixes: the
 * rule every "is this busy?" question scopes by (`'account'` covers `'accountProfile'`).
 *
 * @param value - the key being tested
 * @param prefixes - the prefixes to match; none matches everything
 * @returns whether it matches
 */
export const matchesAnyPrefix = (value: unknown, prefixes: readonly string[]): boolean =>
    prefixes.length === 0 ||
    (typeof value === 'string' && prefixes.some((prefix) => value.startsWith(prefix)));

/**
 * True for `null` and `undefined`: a value that holds nothing (an empty server answer).
 *
 * @param value - the value being tested
 * @returns whether it is `null` or `undefined`
 */
export const isNil = (value: unknown): value is null | undefined =>
    value === undefined || value === null;
