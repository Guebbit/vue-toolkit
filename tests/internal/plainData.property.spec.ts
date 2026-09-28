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

    // A search's `filters` object is stableKey'd for its cache key: two searches whose filters
    // hold different Sets (a multi-select's `Set<string>`, say) must land in different cache
    // entries, not collide on one shared `"{}"` — see A9.
    it('produces different keys for two Sets that differ in content', () => {
        fc.assert(
            fc.property(
                fc.uniqueArray(fc.string()),
                fc.uniqueArray(fc.string()),
                (itemsA, itemsB) => {
                    fc.pre(stableKey(itemsA.toSorted()) !== stableKey(itemsB.toSorted()));
                    expect(stableKey(new Set(itemsA))).not.toBe(stableKey(new Set(itemsB)));
                }
            )
        );
    });

    it("a Set's own insertion order never changes its key", () => {
        fc.assert(
            fc.property(fc.uniqueArray(fc.string()), fc.nat(7), (items, rotateBy) => {
                expect(stableKey(new Set(rotate(items, rotateBy)))).toBe(stableKey(new Set(items)));
            })
        );
    });

    it('a Set never stableKeys the same as an array of the same items', () => {
        fc.assert(
            fc.property(fc.uniqueArray(fc.string(), { minLength: 1 }), (items) => {
                expect(stableKey(new Set(items))).not.toBe(stableKey(items));
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

    it('one differing segment anywhere inside the prefix is a miss', () => {
        fc.assert(
            fc.property(
                fc.array(fc.jsonValue(), { minLength: 1 }),
                fc.array(fc.jsonValue()),
                fc.nat(),
                fc.jsonValue(),
                (prefix, rest, at, replacement) => {
                    const index = at % prefix.length;
                    fc.pre(replacement !== prefix[index]);
                    const key = [...prefix, ...rest];
                    key[index] = replacement;
                    expect(hasKeyPrefix(key, prefix)).toBe(false);
                }
            )
        );
    });

    it('the right segments in the wrong order are a miss', () => {
        fc.assert(
            fc.property(
                fc.uniqueArray(fc.oneof(fc.string(), fc.integer()), { minLength: 2 }),
                fc.array(fc.jsonValue()),
                (prefix, rest) => {
                    expect(hasKeyPrefix([...rotate(prefix, 1), ...rest], prefix)).toBe(false);
                }
            )
        );
    });

    it('a key shorter than a non-empty prefix, or no key at all, is a miss', () => {
        fc.assert(
            fc.property(
                fc.array(fc.jsonValue(), { minLength: 1 }),
                fc.nat(),
                fc.boolean(),
                (prefix, cut, missing) => {
                    const key = missing ? undefined : prefix.slice(0, cut % prefix.length);
                    expect(hasKeyPrefix(key, prefix)).toBe(false);
                }
            )
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

    it('a string starting with any one of the prefixes matches', () => {
        fc.assert(
            fc.property(
                fc.array(fc.string(), { minLength: 1 }),
                fc.nat(),
                fc.string(),
                (prefixes, pick, rest) => {
                    const value = prefixes[pick % prefixes.length] + rest;
                    expect(matchesAnyPrefix(value, prefixes)).toBe(true);
                }
            )
        );
    });

    it('a string starting with none of the prefixes does not match', () => {
        fc.assert(
            fc.property(
                fc.string(),
                fc.array(fc.string({ minLength: 1 }), { minLength: 1 }),
                (value, prefixes) => {
                    fc.pre(prefixes.every((prefix) => !value.startsWith(prefix)));
                    expect(matchesAnyPrefix(value, prefixes)).toBe(false);
                }
            )
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

    it('detaches a Set field: editing the copy leaves the source Set untouched', () => {
        const source = { tags: new Set(['a']) };
        const copy = detachedCopy(source);
        copy.tags.add('b');
        expect([...source.tags]).toEqual(['a']);
    });

    it('detaches a Map field: editing the copy leaves the source Map untouched', () => {
        const source = { limits: new Map([['max', 1]]) };
        const copy = detachedCopy(source);
        copy.limits.set('max', 2);
        expect(source.limits.get('max')).toBe(1);
    });

    it('copies a Date, so editing the copy in place leaves the source untouched', () => {
        const source = { at: new Date('2024-01-01') };
        const copy = detachedCopy(source);
        copy.at.setUTCFullYear(2099);
        expect(source.at.getUTCFullYear()).toBe(2024);
    });

    // Policy, not a bug: there is no safe generic clone for a class instance
    // (`structuredClone` drops the prototype). Replace it, don't mutate it — see the docs.
    it('keeps a class instance by reference: there is no safe generic clone for one', () => {
        class Address {
            constructor(public city: string) {}
        }
        const address = new Address('London');
        const copy = detachedCopy({ address });
        expect(copy.address).toBe(address);
    });
});
