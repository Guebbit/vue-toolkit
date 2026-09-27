/**
 * PROPERTY — internal/plainData.ts: identity and copying for plain-data values.
 * Pins the invariants the module's own JSDoc claims, across generated inputs rather than
 * hand-picked examples. See docs/guide/testing.md for how to replay a failure (seed + path).
 */
import fc from 'fast-check';
import { reactive } from 'vue';
import {
    detachedCopy,
    hasKeyPrefix,
    matchesAnyPrefix,
    stableKey
} from '../../src/internal/plainData';

/** Rotates an array by `by` positions — a cheap, deterministic reordering for key-order tests. */
const rotate = <E>(array: E[], by: number): E[] =>
    array.length === 0
        ? array
        : [...array.slice(by % array.length), ...array.slice(0, by % array.length)];

/**
 * True when `copy` and `source` share a plain object or array reference anywhere in their tree —
 * what `detachedCopy` promises never happens.
 */
const sharesReference = (copy: unknown, source: unknown): boolean => {
    if (copy === source && typeof copy === 'object' && copy !== null) return true;
    if (Array.isArray(copy) && Array.isArray(source))
        return copy.some((item, index) => sharesReference(item, source[index]));
    if (
        typeof copy === 'object' &&
        copy !== null &&
        typeof source === 'object' &&
        source !== null &&
        !Array.isArray(copy) &&
        !Array.isArray(source)
    ) {
        const sourceRecord = source as Record<string, unknown>;
        return Object.entries(copy as Record<string, unknown>).some(([key, value]) =>
            sharesReference(value, sourceRecord[key])
        );
    }
    return false;
};

describe('PROPERTY · stableKey', () => {
    it('is unaffected by key order', () => {
        fc.assert(
            fc.property(
                fc.dictionary(fc.string(), fc.jsonValue(), { maxKeys: 8 }),
                fc.nat(7),
                (object, rotateBy) => {
                    const reordered = Object.fromEntries(rotate(Object.entries(object), rotateBy));
                    expect(stableKey(reordered)).toBe(stableKey(object));
                }
            )
        );
    });

    it('ignores properties explicitly set to undefined', () => {
        fc.assert(
            fc.property(
                fc.dictionary(fc.string(), fc.jsonValue()),
                fc.string(),
                (object, extraKey) => {
                    fc.pre(!(extraKey in object));
                    const withUndefined = { ...object, [extraKey]: undefined };
                    expect(stableKey(withUndefined)).toBe(stableKey(object));
                }
            )
        );
    });

    it('produces different keys for values that differ in content', () => {
        fc.assert(
            fc.property(fc.jsonValue(), fc.string(), fc.string(), (base, tagA, tagB) => {
                fc.pre(tagA !== tagB);
                expect(stableKey({ base, tag: tagA })).not.toBe(stableKey({ base, tag: tagB }));
            })
        );
    });
});

describe('PROPERTY · hasKeyPrefix', () => {
    it('a prefix is always a prefix of itself followed by anything', () => {
        fc.assert(
            fc.property(fc.array(fc.jsonValue()), fc.array(fc.jsonValue()), (prefix, rest) => {
                expect(hasKeyPrefix([...prefix, ...rest], prefix)).toBe(true);
            })
        );
    });

    it('an empty prefix matches any key, missing key included', () => {
        fc.assert(
            fc.property(fc.option(fc.array(fc.jsonValue()), { nil: undefined }), (key) => {
                expect(hasKeyPrefix(key, [])).toBe(true);
            })
        );
    });
});

describe('PROPERTY · matchesAnyPrefix', () => {
    it('no prefixes matches anything', () => {
        fc.assert(
            fc.property(fc.jsonValue(), (value) => {
                expect(matchesAnyPrefix(value, [])).toBe(true);
            })
        );
    });

    it('a non-string value never matches a non-empty prefix list', () => {
        fc.assert(
            fc.property(
                fc.jsonValue().filter((value) => typeof value !== 'string'),
                fc.array(fc.string(), { minLength: 1 }),
                (value, prefixes) => {
                    expect(matchesAnyPrefix(value, prefixes)).toBe(false);
                }
            )
        );
    });
});

describe('PROPERTY · detachedCopy', () => {
    it('is deep-equal to its source', () => {
        fc.assert(
            fc.property(fc.jsonValue(), (value) => {
                expect(detachedCopy(value)).toEqual(value);
            })
        );
    });

    it('shares no plain object or array with its source', () => {
        fc.assert(
            fc.property(fc.object(), (value) => {
                expect(sharesReference(detachedCopy(value), value)).toBe(false);
            })
        );
    });

    it('editing the copy never changes the source, reactive sources included', () => {
        fc.assert(
            fc.property(fc.dictionary(fc.string(), fc.jsonValue(), { minKeys: 1 }), (plain) => {
                const source = reactive(plain);
                const copy = detachedCopy(source) as Record<string, unknown>;
                for (const key of Object.keys(copy)) copy[key] = 'mutated';
                expect({ ...source }).toEqual(plain);
            })
        );
    });
});
