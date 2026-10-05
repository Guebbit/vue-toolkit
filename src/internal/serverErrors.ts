/**
 * Server-side validation errors, read out of a rejection in whatever shape the API used.
 *
 * Two pure steps: `readServerErrors` finds the error collection (on the rejection itself, its
 * `.data`, or an axios `.response.data`) and flattens it — a field map, a list of objects, or a
 * list of strings — into `{ field?, messages }` entries; `partitionServerErrors` then splits those
 * into messages for fields the form has and form-level ones.
 *
 * @module internal/serverErrors
 * @see docs/composables/structure-form-validation.md
 */
import { isRecord, ownValue } from './plainData.js';

/**
 * One server-reported error: the field it belongs to (if any) and what to say about it.
 */
export interface IServerErrorEntry {
    /** Server-side field name; absent for a form-level message. */
    field?: string;
    /** Non-empty message strings for that field. */
    messages: string[];
}

/**
 * Coerces a server-supplied message value — one string or a list — into a clean list.
 *
 * @param value - a message, a list of messages, or junk (which yields `[]`)
 */
const asMessages = (value: unknown): string[] => {
    if (typeof value === 'string') return value ? [value] : [];
    if (Array.isArray(value))
        return value.filter(
            (message): message is string => typeof message === 'string' && !!message
        );
    return [];
};

/**
 * Reads the field name out of one entry of an array-shaped error list.
 *
 * Covers `field`, `name`, `param` (express-validator) and `path` (a string, or the array Zod
 * emits). Nested paths collapse to their root, since formErrors is keyed by top-level field —
 * the same thing validate() does with Zod issues.
 *
 * @param entry - one object from the server's error list
 */
const readEntryField = (entry: Record<string, unknown>): string | undefined => {
    for (const key of ['field', 'name', 'param']) {
        const value = entry[key];
        if (typeof value === 'string' && value) return value;
    }
    const { path } = entry;
    if (typeof path === 'string' && path) return path;
    return Array.isArray(path) && typeof path[0] === 'string' && path[0] ? path[0] : undefined;
};

/**
 * Finds the error collection inside a rejection, wherever the transport left it: the value itself
 * (a normalized envelope), `.data` (an unwrapped body), or `.response.data` (a raw axios error).
 *
 * @param error - the rejected value, exactly as caught
 */
const findErrorCollection = (error: unknown): unknown => {
    const containers: unknown[] = [error];
    if (isRecord(error)) {
        containers.push(error.data);
        if (isRecord(error.response)) containers.push(error.response.data);
    }
    for (const container of containers) {
        if (!isRecord(container)) continue;
        if (container.errors !== undefined) return container.errors;
        if (container.issues !== undefined) return container.issues;
    }
    return undefined;
};

/**
 * Keeps only entries that have something to say.
 *
 * @param entry - a normalized server error
 */
const hasMessages = (entry: IServerErrorEntry): boolean => entry.messages.length > 0;

/**
 * Flattens whichever shape the API used into a uniform entry list:
 *  - field map, `{ email: 'Taken', password: ['Too short'] }`
 *  - list of objects, `[{ field: 'email', message: 'Taken' }]`
 *  - list of strings, which carry no field and become form-level messages
 *
 * @param collection - the `errors` / `issues` value found by findErrorCollection
 */
const normalizeServerErrors = (collection: unknown): IServerErrorEntry[] => {
    if (Array.isArray(collection))
        return collection
            .map((entry): IServerErrorEntry => {
                if (typeof entry === 'string') return { messages: asMessages(entry) };
                if (!isRecord(entry)) return { messages: [] };
                return {
                    field: readEntryField(entry),
                    messages: asMessages(entry.message ?? entry.msg)
                };
            })
            .filter((entry) => hasMessages(entry));

    if (isRecord(collection))
        return Object.entries(collection)
            .map(([field, value]): IServerErrorEntry => ({ field, messages: asMessages(value) }))
            .filter((entry) => hasMessages(entry));

    return [];
};

/**
 * Every message a rejection carries, as uniform entries (see the module header).
 *
 * @param error - the rejected value, exactly as caught
 * @returns the entries that have something to say
 */
export const readServerErrors = (error: unknown): IServerErrorEntry[] =>
    normalizeServerErrors(findErrorCollection(error));

/**
 * Splits entries into messages per form field and form-level ones. A server field name is
 * renamed through `map` (names absent from it are used as-is); a field the form does not have
 * cannot be highlighted, so its messages become form-level too.
 *
 * @param entries - see readServerErrors
 * @param map - server field name → form field name
 * @param hasField - whether the form has a field of that name
 * @returns `applied` (messages per form field) and `unmapped` (form-level messages)
 */
export const partitionServerErrors = <F extends PropertyKey>(
    entries: IServerErrorEntry[],
    map: Record<string, F> | undefined,
    hasField: (field: F) => boolean
): { applied: Partial<Record<F, string[]>>; unmapped: string[] } => {
    const applied: Partial<Record<F, string[]>> = {};
    const unmapped: string[] = [];
    for (const { field, messages } of entries) {
        const target = field === undefined ? undefined : (ownValue<F>(map, field) ?? (field as F));
        if (target === undefined || !hasField(target)) unmapped.push(...messages);
        else applied[target] = [...(ownValue<string[]>(applied, target) ?? []), ...messages];
    }
    return { applied, unmapped };
};
