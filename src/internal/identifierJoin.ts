/**
 * Reading a record's id off its identifier field(s), and joining several values into one
 * composite id without collisions.
 *
 * A plain `.join(delimiter)` conflates different splits of the same joined string: `['a', 'b']`
 * joining `['x|y', 'z']` and `['x', 'y|z']` both produce `'x|y|z'`. So each value is escaped
 * first, one character at a time: every character the delimiter is made of, and the escape
 * character itself, gets the escape character in front. An unescaped delimiter character can then
 * only come from the join, which makes it collision-free for ANY delimiter, however long or
 * self-overlapping. The escape character is one the delimiter does not use, so it can never be
 * read as part of a delimiter. A single value never collides with anything (there is nothing to
 * split it from), so it passes through unescaped, exactly like `.join()` on a one-element array.
 *
 * @module internal/identifierJoin
 */

/** Code point 92, a backslash: the preferred escape character, where the search starts. */
const PREFERRED_ESCAPE_CODE = 92;

/** `null`/`undefined` read as `''`, matching `Array.prototype.join`. */
const segmentOf = (value: unknown): string =>
    value === null || value === undefined ? '' : String(value);

/**
 * The escape character for `delimiter`: a backslash, unless the delimiter uses one — then the
 * next character code the delimiter does not use. Deterministic, so one delimiter always escapes
 * the same way.
 *
 * @param delimiter - the separator values are joined with
 * @returns a character absent from `delimiter`
 */
const escapeCharacterFor = (delimiter: string): string => {
    let code = PREFERRED_ESCAPE_CODE;
    while (delimiter.includes(String.fromCodePoint(code))) code++;
    return String.fromCodePoint(code);
};

/**
 * One identifier value, escaped so it cannot be mistaken for a delimiter boundary. Works on code
 * points, so an escape never lands inside a surrogate pair.
 *
 * @param value - the identifier value
 * @param delimiter - the separator it will be joined with
 * @param escape - the escape character (see escapeCharacterFor)
 * @returns the escaped segment
 */
const escapeSegment = (value: unknown, delimiter: string, escape: string): string =>
    [...segmentOf(value)]
        .map((point) => (point === escape || delimiter.includes(point) ? escape + point : point))
        .join('');

/**
 * Joins identifier values into one composite id, escaping each value first so two different
 * tuples never collide. A single value, or a value using none of the delimiter's characters nor
 * the escape character, passes through unescaped — the common case stays a plain, readable id.
 *
 * @param values - the identifier values, in order
 * @param delimiter - the separator joining them
 * @returns the joined id
 */
export const joinIdentifiers = (values: readonly unknown[], delimiter: string): string => {
    if (values.length <= 1) return values.map((value) => segmentOf(value)).join(delimiter);
    const escape = escapeCharacterFor(delimiter);
    return values.map((value) => escapeSegment(value, delimiter, escape)).join(delimiter);
};

/**
 * A record's id, read off its identifier field(s), or `undefined` when any of them is missing —
 * never a fabricated one. A single field (a string) yields its raw value; a list of fields yields
 * their values joined (see joinIdentifiers), even when the list holds one field.
 *
 * @param item - the record
 * @param identifiers - the identifier field, or fields in order
 * @param delimiter - the separator joining several values
 * @returns the id, or undefined when an identifier field is null or undefined
 */
export const readIdentifier = (
    item: unknown,
    identifiers: string | readonly string[],
    delimiter: string
): unknown => {
    const fields = typeof identifiers === 'string' ? [identifiers] : identifiers;
    const values = fields.map((field) => (item as Record<string, unknown> | undefined)?.[field]);
    if (values.some((value) => value === undefined || value === null)) return undefined;
    return typeof identifiers === 'string' ? values[0] : joinIdentifiers(values, delimiter);
};
