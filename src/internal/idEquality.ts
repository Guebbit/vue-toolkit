/**
 * When two record ids are the same id: when they name the same object key.
 *
 * A number and its string form are one id, since `dictionary[1]` and `dictionary['1']` are the
 * same slot (and `'1'` is what a route param gives you); a symbol only ever equals itself. Every
 * relation store compares child ids this way, so linking, unlinking and de-duplicating agree with
 * the dictionary the records themselves are stored in.
 *
 * @module internal/idEquality
 */

/**
 * The object key an id occupies.
 *
 * @param id - a record id
 * @returns its string form, or the symbol itself
 */
const keyOf = (id: PropertyKey): string | symbol => (typeof id === 'symbol' ? id : String(id));

/**
 * Whether two ids name the same record.
 *
 * @param one - a record id
 * @param other - another record id
 * @returns true when both occupy the same object key
 */
export const sameId = (one: PropertyKey, other: PropertyKey): boolean =>
    keyOf(one) === keyOf(other);

/**
 * Ids without repeats (see sameId), in first-seen order.
 *
 * @param ids - the ids
 * @returns the unique ids
 */
export const uniqueIds = <K extends PropertyKey>(ids: readonly K[]): K[] => {
    const seen = new Set<string | symbol>();
    return ids.filter((id) => {
        const key = keyOf(id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};
