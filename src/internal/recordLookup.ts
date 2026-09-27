/**
 * Resolving a list of ids into records: the lookup every belongsTo view shares.
 *
 * Ids whose record is not stored are skipped. The list form keeps the ids' order; the dictionary
 * form cannot, since an object orders integer-like keys numerically.
 *
 * @module internal/recordLookup
 */

/**
 * The stored records of `ids`, by id.
 *
 * @param ids - the record ids
 * @param getRecord - reads one record
 * @returns the records, by id
 */
export const recordsByIds = <T, K extends PropertyKey>(
    ids: readonly K[],
    getRecord: (id: K) => T | undefined
): Record<K, T> => {
    const result = {} as Record<K, T>;
    for (const id of ids) {
        const record = getRecord(id);
        if (record !== undefined) result[id] = record;
    }
    return result;
};

/**
 * The stored records of `ids`, in the ids' order.
 *
 * @param ids - the record ids
 * @param getRecord - reads one record
 * @returns the records
 */
export const recordListByIds = <T, K>(
    ids: readonly K[],
    getRecord: (id: K) => T | undefined
): T[] => ids.map((id) => getRecord(id)).filter((record): record is T => record !== undefined);
