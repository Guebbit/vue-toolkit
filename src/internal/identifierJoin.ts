/**
 * Joining identifier values into one composite id without collisions.
 *
 * A plain `.join(delimiter)` conflates different splits of the same joined string: `['a', 'b']`
 * joining `['x|y', 'z']` and `['x', 'y|z']` both produce `'x|y|z'`. Escaping the delimiter (and the
 * escape character itself) inside each value first makes the join collision-free: two different
 * tuples of two-or-more values always produce two different strings. A single value never
 * collides with anything (there is nothing to split it from), so it passes through unescaped,
 * exactly like `.join()` on a one-element array — the single-identifier case stays untouched.
 *
 * @module internal/identifierJoin
 */

/** Escaped first, so escaping the delimiter next can't be undone by it. */
const ESCAPE_CHARACTER = '\\';

/** `null`/`undefined` read as `''`, matching `Array.prototype.join`. */
const segmentOf = (value: unknown): string =>
    value === null || value === undefined ? '' : String(value);

/**
 * One identifier value, escaped so it cannot be mistaken for a delimiter boundary: every
 * `ESCAPE_CHARACTER` becomes doubled, then every `delimiter` is prefixed with one.
 *
 * @param value - the identifier value
 * @param delimiter - the separator it will be joined with
 * @returns the escaped segment
 */
const escapeSegment = (value: unknown, delimiter: string): string =>
    segmentOf(value)
        .split(ESCAPE_CHARACTER)
        .join(ESCAPE_CHARACTER + ESCAPE_CHARACTER)
        .split(delimiter)
        .join(ESCAPE_CHARACTER + delimiter);

/**
 * Joins identifier values into one composite id, escaping `delimiter` inside each value first so
 * two different tuples never collide. A single value, or a value containing neither `delimiter`
 * nor a backslash, is unchanged, so nearly every id looks exactly as it did before.
 *
 * @param values - the identifier values, in order
 * @param delimiter - the separator joining them
 * @returns the joined id
 */
export const joinIdentifiers = (values: readonly unknown[], delimiter: string): string =>
    values.length <= 1
        ? values.map((value) => segmentOf(value)).join(delimiter)
        : values.map((value) => escapeSegment(value, delimiter)).join(delimiter);
