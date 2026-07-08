import { computed, ref } from 'vue';

/**
 * Generates a random fallback value, used to fill in a missing identifier field.
 */
const generateFallbackValue = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const useStructureDataManagement = <
    // type of item
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends Record<string | number | symbol, any> = Record<string, any>,
    // type of item[identifier]
    K extends string | number | symbol = keyof T,
    // type of parent[parent_identifier], where the current item is in a relation "belogsTo" with an unknown parent data
    // WARNING: Typescript is not inferring correctly between different composables and use the default type
    P extends string | number | symbol = string | number | symbol
>(
    //  The identification parameter of the item (READONLY and not exported)
    identifiers: string | string[] = 'id',
    // Delimiter for multiple identifiers
    delimiter = '|'
) => {
    /**
     * Fills the given (missing) identifier field(s) directly on itemData with a random fallback
     * value, so the generated id is:
     *  - readable back from the item itself (e.g. item.id) after insertion
     *  - stable across repeated calls (createIdentifier is called more than once per item, e.g.
     *    once by the caller and again internally by addRecord/editRecord)
     *
     * @param itemData
     * @param missingKeys - identifier field name(s) to fill in
     */
    const fillMissingIdentifiers = <C>(itemData: C, missingKeys: string[]): void => {
        if (typeof itemData !== 'object' || itemData === undefined || itemData === null) return;
        const fallback = generateFallbackValue();
        for (const key of missingKeys) (itemData as Record<string, unknown>)[key] = fallback;
        // eslint-disable-next-line no-console
        console.warn(
            'structureDataManagement - item is missing its identifier, generating a temporary fallback id',
            fallback,
            itemData
        );
    };

    /**
     *
     * @param itemData
     * @param customIdentifiers - if specified, it will create a key using these identifiers instead of the default ones
     */

    const createIdentifier = <C = T>(itemData: C, customIdentifiers?: string | string[]): K => {
        const _identifiers = customIdentifiers ?? identifiers;
        if (Array.isArray(_identifiers)) {
            const values = _identifiers.map((key) => itemData[key as keyof C]);
            const missingKeys = _identifiers.filter((_key, index) => values[index] == undefined);
            if (missingKeys.length > 0) {
                fillMissingIdentifiers(itemData, missingKeys);
                return _identifiers.map((key) => itemData[key as keyof C]).join(delimiter) as K;
            }
            return values.join(delimiter) as K;
        }
        const value = itemData[identifier as keyof C];
        if (value === undefined || value === null) {
            fillMissingIdentifiers(itemData, [identifier]);
            return itemData[identifier as keyof C] as K;
        }
        return value as K;
    };

    /**
     * True identifier, become a string if it is an array
     * (no need to be reactive)
     */
    const identifier = Array.isArray(identifiers) ? identifiers.join(delimiter) : identifiers;

    /**
     * Dictionary of items (to be filled)
     */
    const itemDictionary = ref({} as Record<K, T>);

    /**
     * List of items
     */
    const itemList = computed<T[]>(() => Object.values(itemDictionary.value as Record<K, T>));

    /**
     * Set records directly to the dictionary
     *
     * @param items
     */
    const setRecords = (items: Record<K, T>): Record<K, T> => (itemDictionary.value = items);

    /**
     * Empty the items dictionary
     */
    const resetRecords = () => (itemDictionary.value = {});

    /**
     * Get record from object dictionary using identifier
     *
     * @param _arguments
     */
    const getRecord = (..._arguments: (K | undefined)[]): T | undefined =>
        // Important to directly access the dictionary to avoid reactivity issues
        itemDictionary.value[_arguments.join(delimiter) as K];

    /**
     * Multiple getRecord
     *
     * @param idsArray
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

    /**
     * Record for @{lastInsertedIdentifier}
     */
    const lastInsertedRecord = computed<T | undefined>(() =>
        getRecord(lastInsertedIdentifier.value)
    );

    /**
     * Add item to the dictionary.
     * If item already present, it will be overwritten
     *
     * @param itemData
     */
    const addRecord = (itemData: T) => {
        const id = createIdentifier(itemData);
        lastInsertedIdentifier.value = id;
        return ((itemDictionary.value as Record<K, T>)[id] = itemData);
    };

    /**
     * Add a list of items to the dictionary.
     *
     * @param itemsArray
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
     * Edit item,
     * If item not present, it will be ignored
     * If it is present, it will be merged with the new partial data
     * WARNING: If identifier change, it does NOT automatically update the dictionary id.
     *
     * @param data
     * @param id - WARNING: needed createIdentifier if identifiers is array
     * @param create - if true it will be added if not present
     * @returns the record's id if this call created a new record, undefined if it only updated an existing one
     */
    const editRecord = (data: Partial<T> = {}, id?: K | K[], create = true): K | undefined => {
        // if NOT forced to create and NOT given an id: error (avoid inferring/generating a fallback id for nothing)
        if (!create && !id) {
            // eslint-disable-next-line no-console
            console.error('storeDataStructure - data not found', data);
            return;
        }

        // If not specified, it will be inferred (using the same fallback-id logic as createIdentifier)
        // if multiple identifiers, then they need to be joined\translated
        const _id = (Array.isArray(id) ? (id.join(delimiter) as K) : id) ?? createIdentifier(data);

        const isNew = !Object.prototype.hasOwnProperty.call(itemDictionary.value, _id);

        // if NOT forced to create and NOT found: error
        if (!create && isNew) {
            // eslint-disable-next-line no-console
            console.error('storeDataStructure - data not found', data);
            return;
        }

        // Replace data if already present
        (itemDictionary.value as Record<K, T>)[_id] = {
            ...(itemDictionary.value as Record<K, T>)[_id],
            ...data
        };

        if (!isNew) return;
        lastInsertedIdentifier.value = _id;
        return _id;
    };

    /**
     * Same as addRecords but with editRecord
     *
     * @param itemsArray
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
     * Delete record
     *
     * @param id
     */
    const deleteRecord = (id: K) =>
        getRecord(id) && delete (itemDictionary.value as Record<K, T>)[id];

    /**
     * Selected ID
     */
    const selectedIdentifier = ref<K>();

    /**
     * Selected item (by @{selectedIdentifier})
     * Can have 2 uses:
     *  - List mode: Show in modal or operations that require the details (example items in a table)
     *  - Target mode: a detail page or a form to edit the selected item (example item in a dedicated detail page)
     */
    const selectedRecord = computed<T | undefined>(() => getRecord(selectedIdentifier.value));

    /**
     * ---------------------------------- OFFLINE PAGINATION ------------------------------------
     */

    /**
     * Current selected page (start with 1)
     */
    const pageCurrent = ref(1);

    /**
     * How many items in page
     */
    const pageSize = ref(10);

    /**
     * How many pages exist
     */
    const pageTotal = computed(() => Math.ceil(itemList.value.length / pageSize.value));

    /**
     * First item of the current page
     */
    const pageOffset = computed(() => pageSize.value * (pageCurrent.value - 1));

    /**
     * Items shown in current page
     */
    const pageItemList = computed(() =>
        itemList.value.slice(pageOffset.value, pageOffset.value + pageSize.value)
    );

    /**
     * ----------------------------- hasMany & belongsTo relationships -----------------------------
     */

    /**
     * If the item has a parent, here will be stored a "parent hasMany" relation
     */
    const parentHasMany = ref({} as Record<P, (typeof identifier)[]>);

    /**
     *
     * @param parentId
     * @param childId
     */
    const addToParent = (parentId: P, childId: typeof identifier) => {
        if (!(parentHasMany.value as Record<P, unknown>)[parentId])
            (parentHasMany.value as Record<P, (typeof identifier)[]>)[parentId] =
                [] as (typeof identifier)[];
        (parentHasMany.value as Record<P, (typeof identifier)[]>)[parentId].push(childId);
    };

    /**
     *
     * @param parentId
     * @param childId
     */
    const removeFromParent = (parentId: P, childId: typeof identifier) =>
        ((parentHasMany.value as Record<P, (typeof identifier)[]>)[parentId] = (
            parentHasMany.value as Record<P, (typeof identifier)[]>
        )[parentId].filter((id: typeof identifier) => id !== childId));

    /**
     *
     * @param parentId
     */
    const removeDuplicateChildren = (parentId: P) =>
        ((parentHasMany.value as Record<P, (typeof identifier)[]>)[parentId] = [
            ...new Set((parentHasMany.value as Record<P, (typeof identifier)[]>)[parentId])
        ]);

    /**
     * Get all records ID by parent and use them to retrieve the complete dictionary
     * @param parentId
     */
    const getRecordsByParent = (parentId?: P): Record<K, T> => {
        const result = {} as Record<K, T>;
        if (!parentId || !(parentHasMany.value as Record<P, unknown>)[parentId]) return result;
        for (const key of (parentHasMany.value as Record<P, unknown[]>)[parentId]) {
            const record = getRecord(key as K);
            if (record) result[key as K] = record;
        }
        return result;
    };

    /**
     * Same as above but with array result
     * @param parentId
     */
    const getListByParent = (parentId?: P): T[] => Object.values(getRecordsByParent(parentId));

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
