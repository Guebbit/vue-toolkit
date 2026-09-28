/**
 * Client-side record management: a dictionary of records keyed by identifier, selection,
 * "last inserted" tracking, client-side pagination and belongsTo relations.
 *
 * Every write goes through an `IRecordStore` and an `IRelationStore`. The default ones are plain
 * reactive dictionaries; `useStructureRestApi` passes TanStack-backed ones, which turn both into
 * read-only views of its query cache — so this composable never builds local state the REST layer
 * would only shadow.
 *
 * @module composables/structureDataManagement
 * @see docs/composables/structure-data-management.md
 */
import { computed, customRef, ref, toRaw, type ComputedRef, type Ref } from 'vue';
import { getUuid } from '@guebbit/js-toolkit';
import { recordListByIds, recordsByIds } from '../internal/recordLookup.js';
import { joinIdentifiers } from '../internal/identifierJoin.js';
import { sameId, uniqueIds } from '../internal/idEquality.js';

/**
 * The type of `T`'s own `id` field, when it has one shaped like a record identifier; `string |
 * number` otherwise. The default `K` of every structure composable: the default `identifiers` is
 * `'id'`, so its type is the natural default for the id a caller gets back from `createIdentifier`/
 * `getRecord` — the type of the *values* records are keyed by, not the union of field names.
 */
export type TIdOf<T> = T extends { id: infer I extends string | number } ? I : string | number;

/**
 * The write surface `useStructureDataManagement` stores its records through: a local reactive
 * dictionary by default, a TanStack-backed one under `useStructureRestApi`.
 */
export interface IRecordStore<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string | number | symbol, any> = Record<string, any>,
    K extends string | number | symbol = TIdOf<T>
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

    /**
     * One record by id, without going through `dictionary`. Absent on a store with no cheaper way
     * to read a single record: `editRecord` then falls back to `dictionary.value[id]`, which under
     * the REST layer is a computed that rebuilds its ENTIRE scope from the query cache on every
     * stale read — fine once, but O(batch × cache size) work over a batch that edits many records
     * in a row, since each write invalidates the computed for the next read.
     */
    read?(id: K): T | undefined;

    /**
     * Whether the write about to happen is a server answer rather than something the caller
     * created (see the REST store's `asFetched`). Absent on a store with no such distinction (the
     * default one), which `addRecord`/`editRecord` read as "not fetched" — every write there is a
     * caller-driven create. Lets `lastInsertedIdentifier` track actual creates only: a record the
     * REST layer stores because the server reported it (a list fetch, a `GET` by id) is not a
     * "just created" record, even though `addRecord`/`editRecord` are the same write path.
     */
    isFetching?(): boolean;
}

/**
 * Default record store: a plain reactive dictionary.
 *
 * @returns the store
 */
const createLocalRecordStore = <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string | number | symbol, any> = Record<string, any>,
    K extends string | number | symbol = TIdOf<T>
>(): IRecordStore<T, K> => {
    /**
     * Cast past UnwrapRef: `T` can involve `any`, which defeats Vue's ref-unwrapping inference
     * and would otherwise widen `.value` to something `IRecordStore`'s plain `Ref<Record<K, T>>`
     * can't structurally match. Purely a type-level fix — `ref()` doesn't act on this at runtime.
     */
    const dictionary = ref({} as Record<K, T>) as Ref<Record<K, T>>;
    return {
        dictionary,
        write: (id: K, item: T) => ((dictionary.value as Record<K, T>)[id] = item),
        remove: (id: K) => delete (dictionary.value as Record<K, T>)[id],
        writeAll: (items: Record<K, T>) => (dictionary.value = items),
        clear: () => (dictionary.value = {} as Record<K, T>),
        read: (id: K) => (dictionary.value as Record<K, T>)[id]
    };
};

/**
 * The write surface `useStructureDataManagement` stores parent/child links through: a local
 * reactive dictionary by default, a TanStack-backed one under `useStructureRestApi`. Child ids
 * compare as object keys: `1` and `'1'` are the same child.
 */
export interface IRelationStore<
    P extends string | number | symbol = string | number | symbol,
    K extends string | number | symbol = string | number | symbol
> {
    /** Reactive read view: every parent's child ids under the current scope. */
    dictionary: Ref<Record<P, K[]>>;

    /** Links a child to a parent, once (a no-op if already linked). */
    addToParent(parentId: P, childId: K): void;

    /** Unlinks a child from a parent. */
    removeFromParent(parentId: P, childId: K): void;

    /** Drops repeated child ids of a parent. */
    removeDuplicateChildren(parentId: P): void;
}

/**
 * Default relation store: a plain reactive dictionary.
 *
 * @returns the store
 */
const createLocalRelationStore = <
    P extends string | number | symbol = string | number | symbol,
    K extends string | number | symbol = string | number | symbol
>(): IRelationStore<P, K> => {
    // Cast past UnwrapRef, same reason as createLocalRecordStore's dictionary.
    const dictionary = ref({} as Record<P, K[]>) as Ref<Record<P, K[]>>;
    return {
        dictionary,
        addToParent: (parentId: P, childId: K) => {
            const children = (dictionary.value[parentId] ??= []);
            if (children.every((id) => !sameId(id, childId))) children.push(childId);
        },
        removeFromParent: (parentId: P, childId: K) => {
            dictionary.value[parentId] = (dictionary.value[parentId] ?? []).filter(
                (id) => !sameId(id, childId)
            );
        },
        removeDuplicateChildren: (parentId: P) => {
            dictionary.value[parentId] = uniqueIds(dictionary.value[parentId] ?? []);
        }
    };
};

/**
 * What {@link useStructureDataManagement} returns: the dictionary and its operations, as an
 * explicit interface (not inferred) so the public `.d.ts` never has to reference this module's
 * own internals to describe it.
 */
export interface IStructureDataManagementApi<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string | number | symbol, any> = Record<string, any>,
    K extends string | number | symbol = TIdOf<T>,
    P extends string | number | symbol = string | number | symbol
> {
    /** The id of a record: its identifier field(s), joined by `delimiter` when several. */
    createIdentifier: <C = T>(itemData: C, customIdentifiers?: string | string[]) => K;

    /** The identifier field name(s), joined by `delimiter` when several. */
    identifier: string;

    /** Every record, by id, as the record store holds it. */
    itemDictionary: Ref<Record<K, T>>;

    /** Every record, as a list. */
    itemList: ComputedRef<T[]>;

    /** Replaces the whole dictionary. */
    setRecords: (items: Record<K, T>) => Record<K, T>;

    /** Empties the dictionary. */
    resetRecords: () => void;

    /** One record by id. Several arguments are joined by `delimiter` (multiple identifiers). */
    getRecord: (..._arguments: (K | undefined)[]) => T | undefined;

    /** Several records by id; ids not stored are skipped. */
    getRecords: (idsArray?: (K | (K | undefined)[])[]) => T[];

    /** Stores a record, replacing any record with the same id. */
    addRecord: (itemData: T) => T;

    /** Stores several records (see `addRecord`); empty slots are skipped. */
    addRecords: (itemsArray: (T | undefined)[]) => void;

    /** Merges `data` into a record; see the composable's own `editRecord` for `create`'s effect. */
    editRecord: (data?: Partial<T>, id?: K | K[], create?: boolean) => K | undefined;

    /** Merges several records (see `editRecord`); empty slots are skipped. */
    editRecords: (itemsArray: (T | undefined)[]) => void;

    /** Removes a record. */
    deleteRecord: (id: K) => boolean | undefined;

    /** Id of the selected record. */
    selectedIdentifier: Ref<K | undefined>;

    /** The record of `selectedIdentifier`. */
    selectedRecord: ComputedRef<T | undefined>;

    /**
     * Id of the most recently inserted (created, not merely updated) record. A record the REST
     * layer stores because the server reported it (a fetch, not a create) never moves this.
     */
    lastInsertedIdentifier: Ref<K | undefined>;

    /** Ids inserted by the most recent batch call (`addRecords`/`editRecords`). */
    lastInsertedIdentifiers: Ref<K[]>;

    /** The record of `lastInsertedIdentifier`. */
    lastInsertedRecord: ComputedRef<T | undefined>;

    /** Current page, from 1. */
    pageCurrent: Ref<number>;

    /** Records per page. Clamped to a minimum of 1 on write. */
    pageSize: Ref<number>;

    /** Page count. */
    pageTotal: ComputedRef<number>;

    /** Index of the current page's first record. */
    pageOffset: ComputedRef<number>;

    /** The current page's records. */
    pageItemList: ComputedRef<T[]>;

    /** Child ids by parent id: the local "parent hasMany" relation. */
    parentHasMany: Ref<Record<P, K[]>>;

    /** Links a child to a parent. */
    addToParent: (parentId: P, childId: K) => void;

    /** Unlinks a child from a parent. */
    removeFromParent: (parentId: P, childId: K) => K[];

    /** Drops repeated child ids of a parent. */
    removeDuplicateChildren: (parentId: P) => K[];

    /** A parent's children, by id. Ids whose record is not stored are skipped. */
    getRecordsByParent: (parentId?: P) => Record<K, T>;

    /** A parent's children, as a list in the relation's order. Ids not stored are skipped. */
    getListByParent: (parentId?: P) => T[];
}

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
    K extends string | number | symbol = TIdOf<T>,
    P extends string | number | symbol = string | number | symbol
>(
    identifiers: string | string[] = 'id',
    delimiter = '|',
    recordStore: IRecordStore<T, K> = createLocalRecordStore<T, K>(),
    relationStore: IRelationStore<P, K> = createLocalRelationStore<P, K>()
): IStructureDataManagementApi<T, K, P> => {
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
     * A record the REST layer stores because the server reported it (a fetch, not a create) never
     * moves this — see IRecordStore.isFetching.
     */
    const lastInsertedIdentifier = ref<K>();

    /**
     * Ids inserted by the most recent batch call (addRecords/editRecords).
     * Reset at the start of each batch call. Cast past UnwrapRef, same reason as `dictionary`.
     */
    const lastInsertedIdentifiers = ref<K[]>([]) as Ref<K[]>;

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
        // A server answer (see IRecordStore.isFetching) is not a "just created" record, even
        // though it goes through this same write.
        if (!recordStore.isFetching?.()) lastInsertedIdentifier.value = id;
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
        for (const item of itemsArray) {
            if (!item) continue;
            addRecord(item);
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
        // Through recordStore.read when it has one: dictionary.value is, under the REST layer, a
        // computed that rebuilds its whole scope from the query cache on every stale read — a
        // single-record read must not pay for that (see IRecordStore.read).
        const existing =
            _id === undefined
                ? undefined
                : // Merged from the raw record: the view may hand out read-only proxies.
                  toRaw(
                      recordStore.read
                          ? recordStore.read(_id)
                          : (itemDictionary.value as Record<K, T>)[_id]
                  );
        const isNew = _id === undefined || existing === undefined;
        if (!create && isNew) {
            // eslint-disable-next-line no-console -- a caller bug worth seeing in development
            console.error('structureDataManagement - no record to edit', data);
            return;
        }
        recordStore.write(_id!, { ...existing, ...data } as T);
        if (!isNew) return;
        // A server answer (see IRecordStore.isFetching) is not a "just created" record, even
        // though it goes through this same write.
        if (!recordStore.isFetching?.()) lastInsertedIdentifier.value = _id;
        return _id;
    };

    /**
     * Merges several records (see editRecord); empty slots are skipped.
     *
     * @param itemsArray - the records
     */
    const editRecords = (itemsArray: (T | undefined)[]) => {
        const ids: K[] = [];
        for (const item of itemsArray) {
            if (!item) continue;
            const insertedId = editRecord(item);
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
     * Records per page: always a whole number, at least 1. A write is rounded down and clamped
     * (under 1 would make `pageTotal` read `Infinity`); a non-finite write (NaN from a bad parse,
     * `Infinity`) has no page size to round to, so it is ignored and the current size stays.
     */
    const pageSize = customRef<number>((track, trigger) => {
        let stored = 10;
        return {
            get: () => {
                track();
                return stored;
            },
            set: (value: number) => {
                const whole = Math.floor(value);
                if (!Number.isFinite(whole)) return;
                const clamped = Math.max(1, whole);
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

    /** Child ids by parent id, read through `relationStore` (see its docs). */
    const parentHasMany = relationStore.dictionary;

    /**
     * Links a child to a parent.
     *
     * @param parentId - the parent id
     * @param childId - the child record id
     */
    const addToParent = (parentId: P, childId: K) => relationStore.addToParent(parentId, childId);

    /**
     * Unlinks a child from a parent.
     *
     * @param parentId - the parent id
     * @param childId - the child record id
     * @returns the parent's remaining child ids
     */
    const removeFromParent = (parentId: P, childId: K): K[] => {
        relationStore.removeFromParent(parentId, childId);
        return parentHasMany.value[parentId] ?? [];
    };

    /**
     * Drops repeated child ids of a parent.
     *
     * @param parentId - the parent id
     * @returns the parent's child ids
     */
    const removeDuplicateChildren = (parentId: P): K[] => {
        relationStore.removeDuplicateChildren(parentId);
        return parentHasMany.value[parentId] ?? [];
    };

    /**
     * A parent's children, by id. Ids whose record is not stored are skipped.
     *
     * @param parentId - the parent id
     * @returns the child records, by id
     */
    const getRecordsByParent = (parentId?: P): Record<K, T> =>
        parentId === undefined
            ? ({} as Record<K, T>)
            : recordsByIds(parentHasMany.value[parentId] ?? [], (id) => getRecord(id));

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
            : recordListByIds(parentHasMany.value[parentId] ?? [], (id) => getRecord(id));

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
