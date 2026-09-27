/**
 * UNIT — internal/identifierJoin.ts: boundary cases the property spec's random generation doesn't
 * reliably hit (a literal backslash in a value, a single null/undefined value, the exact
 * one-vs-two-value boundary). See tests/structureDataManagement.property.spec.ts for the general
 * "different tuples never collide" property.
 */
import { joinIdentifiers } from '../../src/internal/identifierJoin';

describe('UNIT · joinIdentifiers', () => {
    it('a single value passes through unescaped, even containing the delimiter', () => {
        expect(joinIdentifiers(['a|b'], '|')).toBe('a|b');
    });

    it('a single null or undefined value reads as an empty string', () => {
        // eslint-disable-next-line unicorn/no-null -- exercising the null branch on purpose
        expect(joinIdentifiers([null], '|')).toBe('');
        expect(joinIdentifiers([undefined], '|')).toBe('');
    });

    it('exactly two values (the escaping boundary) are joined plainly when delimiter-free', () => {
        expect(joinIdentifiers(['x', 'y'], '|')).toBe('x|y');
    });

    it('a null or undefined value inside a multi-value join reads as an empty string too', () => {
        // eslint-disable-next-line unicorn/no-null -- exercising the null branch on purpose
        expect(joinIdentifiers([null, 'b'], '|')).toBe('|b');
        expect(joinIdentifiers(['a', undefined], '|')).toBe('a|');
    });

    it('escapes a literal backslash BEFORE escaping the delimiter, so the two never collide', () => {
        // Escaping order matters: if the delimiter were escaped first, this value's own
        // backslash would then get caught up in that escape and misread on the other side.
        // String.raw can't spell a string ending in a single backslash (the tokenizer reads a
        // trailing `\` as escaping the closing backtick), hence the plain escaped literals here.
        // eslint-disable-next-line unicorn/prefer-string-raw
        expect(joinIdentifiers(['a\\', 'b'], '|')).toBe('a\\\\|b');
        // eslint-disable-next-line unicorn/prefer-string-raw
        expect(joinIdentifiers(['a\\', 'b'], '|')).not.toBe(joinIdentifiers(['a', '\\b'], '|'));
    });

    it('prefixes a delimiter found inside a value with the escape character', () => {
        expect(joinIdentifiers(['a|b', 'c'], '|')).toBe(String.raw`a\|b|c`);
    });
});
