/**
 * Client-side record management: a dictionary of records keyed by identifier, selection,
 * "last inserted" tracking, client-side pagination and belongsTo relations.
 *
 * Every write goes through an `IRecordStore`. The default one is a plain reactive dictionary;
 * `useStructureRestApi` passes a TanStack-backed one, which turns the dictionary into a
 * read-only view of its query cache.
 *
 * @module composables/structureDataManagement
 * @see docs/composables/structure-data-management.md
 */
import { computed, customRef, ref, toRaw, type Ref } from 'vue';
import { getUuid } from '@guebbit/js-toolkit';
import { recordListByIds, recordsByIds } from '../internal/recordLookup.js';
import { joinIdentifiers } from '../internal/identifierJoin.js';

/**
 * The write surface `useStructureDataManagement` stores its records through: a local reactive
 * dictionary by default, a TanStack-backed one under `useStructureRestApi`.
 */
export interface IRecordStore<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string | number | symbol, any> = Record<string, any>,
    K extends string | number | symbol = keyof T
> {
    /**
     * Reactive read view of the whole dictionary: a `Ref` locally, a `ComputedRef` under the
     * REST layer (which satisfies `Ref` in Vue's type hierarchy).
     */
    dictionary: Ref<Record<K, T>>;

    /** Writes one record. */
    write(id: K, item: T): void;

    /** Removes one record. */
    remove(id: K): void;

    /** Replaces the whole dictionary. */
    writeAll(items: Record<K, T>): void;

    /** Empties the whole dictionary. */
    clear(): void;

    /**
     * Follows an id to the one it actually holds a record under, one hop. Absent on a store with
     * no such indirection (the default one): `getRecord` then reads `id` as given.
     */
    resolve?(id: K): K;
}

/**
 * Default record store: a plain reactive dictionary.
 *
 * @returns the store
 */
const createLocalRecordStore = <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string | number | symbol, any> = Record<string, any>,
    K extends string | number | symbol = keyof T
>(): IRecordStore<T, K> => {
    // Cast past UnwrapRef: T can involve `any`, which defeats Vue's ref-unwrapping inference and
    // would otherwise widen `.value` to something IRecordStore's plain `Ref<Record<K, T>>` can't
    // structurally match. Purely a type-level fix — ref() doesn't act on this at runtime.
    const dictionary = ref({} as Record<K, T>) as Ref<Record<K, T>>;
    return {
        dictionary,
        write: (id: K, item: T) => ((dictionary.value as Record<K, T>)[id] = item),
        remove: (id: K) => delete (dictionary.value as Record<K, T>)[id],
        writeAll: (items: Record<K, T>) => (dictionary.value = items),
        clear: () => (dictionary.value = {} as Record<K, T>)
    };
};

/**
 * Records in a reactive dictionary, with selection, client-side pagination and belongsTo
 * relations.
 *
 * Type parameters: `T` the record, `K` its identifier, `P` a parent's identifier (TypeScript
 * does not infer `P` across composables: pass it explicitly when it matters).
 *
 * @param identifiers - the record field (or fields, order-sensitive) that identifies a record
 * @param delimiter - joins the values of multiple identifiers into one id
 * @param recordStore - where records are stored; a local reactive dictionary by default
 * @returns the dictionary and its operations
 */
export const useStructureDataManagement = <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string | number | symbol, any> = Record<string, any>,
    K extends string | number | symbol = keyof T,
    P extends string | number | symbol = string | number | symbol
>(
    identifiers: string | string[] = 'id',
    delimiter = '|',
    recordStore: IRecordStore<T, K> = createLocalRecordStore<T, K>()
) => {
    /**
     * Fills the given (missing) identifier field(s) directly on itemData with a random fallback
     * value, so the generated id is:
     *  - readable back from the item itself (e.g. item.id) after insertion
     *  - stable across repeated calls (createIdentifier is called more than once per item, e.g.
     *    once by the caller and again internally by addRecord/editRecord)
     *
     * @param itemData - the record to fill in place
     * @param missingKeys - identifier field name(s) to fill in
     */
    const fillMissingIdentifiers = <C>(itemData: C, missingKeys: string[]): void => {
        if (typeof itemData !== 'object' || itemData === null) return;
        const fallback = getUuid();
        for (const key of missingKeys) (itemData as Record<string, unknown>)[key] = fallback;
        // eslint-disable-next-line no-console -- a missing id is worth seeing in development
        console.warn(
            'structureDataManagement - item is missing its identifier, generating a temporary fallback id',
            fallback,
            itemData
        );
    };

    /**
     * The id of a record: its identifier field, or its identifier fields joined by `delimiter`.
     * A missing identifier is filled with a random fallback (see fillMissingIdentifiers).
     *
     * @param itemData - the record
     * @param customIdentifiers - identifier field(s) to use instead of the composable's own
     * @returns the id
     */
    const createIdentifier = <C = T>(itemData: C, customIdentifiers?: string | string[]): K => {
        const _identifiers = customIdentifiers ?? identifiers;
        if (Array.isArray(_identifiers)) {
            const values = _identifiers.map((key) => itemData[key as keyof C]);
            const missingKeys = _identifiers.filter((_key, index) => values[index] == undefined);
            if (missingKeys.length > 0) {
                fillMissingIdentifiers(itemData, missingKeys);
                return joinIdentifiers(
                    _identifiers.map((key) => itemData[key as keyof C]),
                    delimiter
                ) as K;
            }
            return joinIdentifiers(values, delimiter) as K;
        }
        // A single identifier field: the custom one when given.
        const key = _identifiers as string;
        const value = itemData[key as keyof C];
        if (value === undefined || value === null) {
            fillMissingIdentifiers(itemData, [key]);
            return itemData[key as keyof C] as K;
        }
        return value as K;
    };

    /** The identifier field name(s), joined by `delimiter` when several. */
    const identifier = Array.isArray(identifiers) ? identifiers.join(delimiter) : identifiers;

    /**
     * Every record, by id, as the record store holds it. Never pruned by age: stale data still
     * renders while a fresher copy downloads.
     */
    const itemDictionary = recordStore.dictionary;

    /** Every record, as a list. */
    const itemList = computed<T[]>(() => Object.values(itemDictionary.value as Record<K, T>));

    /**
     * Replaces the whole dictionary.
     *
     * @param items - the new records, by id
     * @returns the same records
     */
    const setRecords = (items: Record<K, T>): Record<K, T> => {
        recordStore.writeAll(items);
        return items;
    };

    /** Empties the dictionary. */
    const resetRecords = () => recordStore.clear();

    /**
     * One record by id. Several arguments are joined by `delimiter` (multiple identifiers).
     *
     * @param _arguments - the id, or the values of multiple identifiers
     * @returns the record, if stored
     */
    const getRecord = (..._arguments: (K | undefined)[]): T | undefined => {
        const id = joinIdentifiers(_arguments, delimiter) as K;
        return itemDictionary.value[recordStore.resolve?.(id) ?? id];
    };

    /**
     * Several records by id; ids not stored are skipped.
     *
     * @param idsArray - ids, or arrays of multiple-identifier values
     * @returns the stored records
     */
    const getRecords = (idsArray: (K | (K | undefined)[])[] = []) =>
        idsArray
            .map((id) => (Array.isArray(id) ? getRecord(...id) : getRecord(id)))
            .filter(Boolean) as T[];

    /**
     * Id of the most recently inserted (newly created, not merely updated) record.
     * Mirrors e.g. Laravel's lastInsertId() — read this right after an add/create
     * call when the id isn't available any other way (auto-generated fallback ids, deep call chains, ...).
     */
    const lastInsertedIdentifier = ref<K>();

    /**
     * Ids inserted by the most recent batch call (addRecords/editRecords).
     * Reset at the start of each batch call.
     */
    const lastInsertedIdentifiers = ref<K[]>([]);

    /** The record of `lastInsertedIdentifier`. */
    const lastInsertedRecord = computed<T | undefined>(() =>
        getRecord(lastInsertedIdentifier.value)
    );

    /**
     * Stores a record, replacing any record with the same id.
     *
     * @param itemData - the record
     * @returns the record
     */
    const addRecord = (itemData: T) => {
        const id = createIdentifier(itemData);
        lastInsertedIdentifier.value = id;
        recordStore.write(id, itemData);
        return itemData;
    };

    /**
     * Stores several records (see addRecord); empty slots are skipped.
     *
     * @param itemsArray - the records
     */
    const addRecords = (itemsArray: (T | undefined)[]) => {
        const ids: K[] = [];
        for (let i = 0, len = itemsArray.length; i < len; i++) {
            if (!itemsArray[i]) continue;
            addRecord(itemsArray[i]!);
            ids.push(lastInsertedIdentifier.value as K);
        }
        lastInsertedIdentifiers.value = ids;
    };

    /**
     * Merges `data` into a record. With `create` (default) a missing record is created; without
     * it only an existing record is edited, and a missing one is left alone (logged). Changing an
     * identifier field does not move the record to a new id.
     *
     * @param data - the fields to merge in
     * @param id - the record id (with multiple identifiers, build it with createIdentifier);
     *             inferred from `data` when omitted and `create` is on
     * @param create - create the record when it is missing
     * @returns the record's id if this call created it, undefined otherwise
     */
    const editRecord = (data: Partial<T> = {}, id?: K | K[], create = true): K | undefined => {
        const _id =
            id === undefined
                ? create
                    ? createIdentifier(data)
                    : undefined
                : Array.isArray(id)
                  ? (joinIdentifiers(id, delimiter) as K)
                  : id;
        const isNew =
            _id === undefined || !Object.prototype.hasOwnProperty.call(itemDictionary.value, _id);
        if (!create && isNew) {
            // eslint-disable-next-line no-console -- a caller bug worth seeing in development
            console.error('structureDataManagement - no record to edit', data);
            return;
        }
        // Merged from the raw record: the view may hand out read-only proxies.
        const existing = toRaw((itemDictionary.value as Record<K, T>)[_id!]);
        recordStore.write(_id!, { ...existing, ...data } as T);
        if (!isNew) return;
        lastInsertedIdentifier.value = _id;
        return _id;
    };

    /**
     * Merges several records (see editRecord); empty slots are skipped.
     *
     * @param itemsArray - the records
     */
    const editRecords = (itemsArray: (T | undefined)[]) => {
        const ids: K[] = [];
        for (let i = 0, len = itemsArray.length; i < len; i++) {
            if (!itemsArray[i]) continue;
            const insertedId = editRecord(itemsArray[i]);
            if (insertedId !== undefined) ids.push(insertedId);
        }
        lastInsertedIdentifiers.value = ids;
    };

    /**
     * Removes a record.
     *
     * @param id - the record id
     * @returns true when a record was removed, undefined when there was none
     */
    const deleteRecord = (id: K): boolean | undefined => {
        if (!getRecord(id)) return;
        recordStore.remove(id);
        return true;
    };

    /** Id of the selected record. */
    const selectedIdentifier = ref<K>();

    /**
     * The record of `selectedIdentifier`: the row opened from a list, or the record a detail page
     * or edit form shows.
     */
    const selectedRecord = computed<T | undefined>(() => getRecord(selectedIdentifier.value));

    // ---------------------------------- client-side pagination ----------------------------------

    /** Current page, from 1. */
    const pageCurrent = ref(1);

    /**
     * Records per page. Clamped to a minimum of 1 on write: a `pageSize` under 1 would turn
     * `pageTotal` into `Infinity`, which is never what a pager showing it wants.
     */
    const pageSize = customRef<number>((track, trigger) => {
        let stored = 10;
        return {
            get: () => {
                track();
                return stored;
            },
            set: (value: number) => {
                const clamped = Math.max(1, value);
                if (clamped === stored) return;
                stored = clamped;
                trigger();
            }
        };
    });

    /** Page count. */
    const pageTotal = computed(() => Math.ceil(itemList.value.length / pageSize.value));

    /** Index of the current page's first record. */
    const pageOffset = computed(() => pageSize.value * (pageCurrent.value - 1));

    /** The current page's records. */
    const pageItemList = computed(() =>
        itemList.value.slice(pageOffset.value, pageOffset.value + pageSize.value)
    );

    // ----------------------------- hasMany & belongsTo relationships -----------------------------

    /** Child ids by parent id: the local "parent hasMany" relation. */
    const parentHasMany = ref({} as Record<P, (typeof identifier)[]>);

    /** parentHasMany's dictionary, typed for writing. */
    const relations = () => parentHasMany.value as Record<P, (typeof identifier)[]>;

    /**
     * Links a child to a parent.
     *
     * @param parentId - the parent id
     * @param childId - the child record id
     */
    const addToParent = (parentId: P, childId: typeof identifier) => {
        (relations()[parentId] ??= []).push(childId);
    };

    /**
     * Unlinks a child from a parent.
     *
     * @param parentId - the parent id
     * @param childId - the child record id
     * @returns the parent's remaining child ids
     */
    const removeFromParent = (parentId: P, childId: typeof identifier) =>
        (relations()[parentId] = (relations()[parentId] ?? []).filter((id) => id !== childId));

    /**
     * Drops repeated child ids of a parent.
     *
     * @param parentId - the parent id
     * @returns the parent's child ids
     */
    const removeDuplicateChildren = (parentId: P) =>
        (relations()[parentId] = [...new Set(relations()[parentId])]);

    /**
     * A parent's children, by id. Ids whose record is not stored are skipped.
     *
     * @param parentId - the parent id
     * @returns the child records, by id
     */
    const getRecordsByParent = (parentId?: P): Record<K, T> =>
        parentId === undefined
            ? ({} as Record<K, T>)
            : recordsByIds((relations()[parentId] ?? []) as K[], (id) => getRecord(id));

    /**
     * A parent's children, as a list in the relation's order. Ids whose record is not stored are
     * skipped.
     *
     * @param parentId - the parent id
     * @returns the child records
     */
    const getListByParent = (parentId?: P): T[] =>
        parentId === undefined
            ? []
            : recordListByIds((relations()[parentId] ?? []) as K[], (id) => getRecord(id));

    return {
        createIdentifier,
        identifier,
        itemDictionary,
        itemList,
        setRecords,
        resetRecords,
        getRecord,
        getRecords,
        addRecord,
        addRecords,
        editRecord,
        editRecords,
        deleteRecord,
        selectedIdentifier,
        selectedRecord,
        lastInsertedIdentifier,
        lastInsertedIdentifiers,
        lastInsertedRecord,

        // Pagination
        pageCurrent,
        pageSize,
        pageTotal,
        pageOffset,
        pageItemList,

        // belongsTo relationship
        parentHasMany,
        addToParent,
        removeFromParent,
        removeDuplicateChildren,
        getRecordsByParent,
        getListByParent
    };
};
