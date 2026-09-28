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
 * True for a plain object literal (or a null-prototype object): what `detachedCopy`/`stableKey`
 * rebuild.
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
 * TEMPORARY local pre-pass ahead of `canonicalize` itself handling Set/Map (tracked upstream in
 * `@guebbit/js-toolkit`): recursively replaces every Set/Map with a tagged, order-independent
 * plain shape `canonicalize` can finish normalizing (sorted key order, Date → ISO string,
 * `undefined` dropped). `canonicalize` does not know Set/Map — it walks any non-Array, non-Date
 * object through `Object.keys()`, which is `[]` for both — so every Set/Map otherwise
 * canonicalizes to `{}`, and two DIFFERENT Sets (or Maps) share one `stableKey`. Remove this
 * pre-pass, and call `canonicalize` directly again, once js-toolkit's own release lands.
 *
 * A WeakSet guards against a reference cycle inside a Set/Map: `canonicalize` has its own cycle
 * guard for the plain structure this hands back to it, so this one only needs to stop an infinite
 * walk here, not produce a perfect result for a case filters are not documented to support.
 *
 * @param value - the value to walk
 * @param seen - collections already being walked, on the current path
 * @returns an equivalent value with every Set/Map replaced by a tagged plain shape
 */
const expandCollections = (value: unknown, seen: WeakSet<object> = new WeakSet()): unknown => {
    if (value instanceof Date || typeof value !== 'object' || value === null) return value;
    if (seen.has(value)) return value;
    seen.add(value);
    let result: unknown;
    if (Array.isArray(value)) result = value.map((item) => expandCollections(item, seen));
    else if (value instanceof Set) {
        const items = [...value].map((item) => expandCollections(item, seen));
        items.sort((a, b) => stableKey(a).localeCompare(stableKey(b)));
        // Tagged: a Set must never stableKey the same as a plain array of the same items.
        result = { stableKeyKind: 'Set', items };
    } else if (value instanceof Map) {
        const entries = [...value].map(([key, item]): [unknown, unknown] => [
            expandCollections(key, seen),
            expandCollections(item, seen)
        ]);
        entries.sort((a, b) => stableKey(a[0]).localeCompare(stableKey(b[0])));
        result = { stableKeyKind: 'Map', entries };
    } else if (isPlainObject(value))
        result = Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, expandCollections(item, seen)])
        );
    else result = value;
    seen.delete(value);
    return result;
};

/**
 * Canonical string for a plain value: property order never changes it, `undefined` properties
 * are ignored, and a Set/Map's insertion order never changes it either (see `canonicalize` and
 * `expandCollections`).
 *
 * @param value - any JSON-like value: objects, arrays, primitives, Dates, Sets, Maps
 * @returns the canonical JSON string
 */
export const stableKey = (value: unknown): string =>
    JSON.stringify(canonicalize(expandCollections(value)));

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
 * Copy of `value` with every plain object, array, Set, Map and Date rebuilt, and Vue proxies
 * unwrapped on the way. A Map's keys are kept by reference (only its values are copied): a Map
 * keyed by object identity — a component, a class instance — must still resolve `.get()` with the
 * caller's own key. Anything else (class instances) is kept by reference: there is no safe
 * generic clone for one (`structuredClone` drops its prototype) — replace it, don't mutate it.
 *
 * @param value - the data to copy
 * @returns a copy sharing no plain object, array, Set, Map or Date with `value`
 */
export const detachedCopy = <V>(value: V): V => {
    const raw = toRaw(value);
    if (Array.isArray(raw)) return raw.map((item: unknown) => detachedCopy(item)) as V;
    if (raw instanceof Set) return new Set([...raw].map((item) => detachedCopy(item))) as V;
    if (raw instanceof Map)
        return new Map([...raw].map(([key, item]) => [key, detachedCopy(item)])) as V;
    if (raw instanceof Date) return new Date(raw) as V;
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
