/**
 * Reactive form state with optional Zod validation and a submit flow.
 *
 * - `form` / `formErrors` refs; errors are keyed by TOP-LEVEL field (nested paths collapse).
 * - Validation is a pure re-parse of `form`, so it can re-run at any time (e.g. a locale switch).
 * - Server rejections are normalized from several common API shapes onto the same `formErrors`.
 *
 * @module composables/structureFormValidation
 * @see docs/composables/structure-form-validation.md
 */
import {
    computed,
    nextTick,
    ref,
    toValue,
    watch,
    type MaybeRefOrGetter,
    type WatchSource
} from 'vue';
import { type ZodType } from 'zod';
import { detachedCopy } from '../internal/plainData.js';

/**
 * In practice the form element, declared structurally so this composable never names a DOM type.
 */
export interface IFieldContainer {
    /** Finds the field to focus; the result is only runtime-checked for a callable `focus`. */
    querySelector: (selectors: string) => unknown;
}

/**
 * Default selector for the field revealErrors() focuses.
 *
 * `aria-invalid` rather than `:invalid` or a UI kit's error class: it is the one marker that is
 * both standard and authored, since a component rendering its own wrapper still has to set it for
 * screen readers.
 */
export const DEFAULT_INVALID_FIELD_SELECTOR = '[aria-invalid="true"]';

/**
 * Options for {@link useStructureFormValidation}.
 */
export interface IStructureFormValidationOptions<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string, any> = Record<string, any>
> {
    /**
     * Sources that, when they change, re-run validation over the UNCHANGED form data.
     *
     * Built for a language switch: `formErrors` holds already-resolved strings, so only a
     * re-parse re-translates them. Pass `i18n.global.locale` for that; the option stays generic
     * so the toolkit never depends on vue-i18n.
     *
     * Only fires while errors are on display: a pristine form must not turn red on a locale change.
     */
    revalidateOn?: WatchSource | WatchSource[];

    /**
     * The form element, so revealErrors() can focus the first invalid field.
     * Omitting it makes revealErrors() a pure state change with no DOM access — what a form
     * rendered under SSR or in a node test needs.
     */
    formElement?: MaybeRefOrGetter<IFieldContainer | undefined | null>;

    /**
     * Selector for the field to focus, default {@link DEFAULT_INVALID_FIELD_SELECTOR}.
     * Override it for a UI kit that marks the wrapper rather than the control, since focus has to
     * land on something focusable.
     */
    invalidFieldSelector?: string;

    /**
     * Called after a submit was rejected by validation, once the errors are on screen.
     * The "please fix the highlighted fields" toast belongs here rather than at every call site.
     *
     * @param errors - the per-field messages now on display
     */
    onInvalid?: (errors: Partial<Record<keyof T, string[]>>) => void;
}

/**
 * How `applyServerErrors` maps a rejection onto the form's fields.
 */
export interface IApplyServerErrorsOptions<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string, any> = Record<string, any>
> {
    /**
     * Renames server field names to form field names (`user_email` -> `email`).
     * Names absent from the map are used as-is, so only the exceptions need listing.
     */
    map?: Record<string, keyof T>;

    /**
     * Receives messages that could not be attached to a field: the API's form-level errors, and
     * any field the form does not have. Without it they are dropped, and the user sees nothing.
     */
    onUnmapped?: (messages: string[]) => void;
}

/**
 * One server-reported error: the field it belongs to (if any) and what to say about it.
 */
interface IServerErrorEntry {
    /** Server-side field name; absent for a form-level message. */
    field?: string;
    /** Non-empty message strings for that field. */
    messages: string[];
}

/**
 * Narrows any value to a plain keyed object.
 *
 * @param value - anything read off a rejection
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

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
    if (Array.isArray(path) && typeof path[0] === 'string' && path[0]) return path[0];
    return undefined;
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
 * Form management composable.
 * Handles reactive form state, optional Zod schema validation and submission flow.
 *
 * @param initialData - initial values for the form fields, and the first reset baseline
 * @param schema      - optional Zod schema: plain, ref or getter, resolved inside `validate()`
 *                      only. Prefer a plain schema with thunk messages (`error: () => t('…')`):
 *                      a getter accidentally called at the call site freezes the language.
 * @param options     - see {@link IStructureFormValidationOptions}
 * @returns form state (`form`, `formErrors`, flags) and the actions that drive it
 */
export const useStructureFormValidation = <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string, any> = Record<string, any>
>(
    initialData: T = {} as T,
    schema?: MaybeRefOrGetter<ZodType<T> | undefined>,
    options: IStructureFormValidationOptions<T> = {}
) => {
    /**
     * Baseline values resetForm() restores and isDirty compares against.
     * Starts as a detached copy of initialData (nested fields included — a shallow copy would
     * leave a hydrated `readonly` record's nested objects read-only here too); setInitialData /
     * activateAutoHydrate replace it, so a record fetched later can become the new baseline.
     */
    const initialFormData = ref<T>(detachedCopy(initialData));

    /**
     * Live form values, bound to the inputs. A detached copy: never shares nested objects with
     * the baseline.
     */
    const form = ref<T>(detachedCopy(initialFormData.value));

    /**
     * Per-field validation errors: top-level field name -> its messages.
     * Holds resolved strings, so a language change needs a re-validate (see `revalidateOn`).
     */
    const formErrors = ref<Partial<Record<keyof T, string[]>>>({});

    /**
     * Whether errors should be displayed.
     * Separate from `formErrors` so validation can run silently; handleSubmit and revealErrors
     * turn it on, an accepted submit turns it off.
     */
    const showFormErrors = ref(false);

    /**
     * Whether a handleSubmit handler is currently running.
     */
    const isSubmitting = ref(false);

    /**
     * True when there are no validation errors.
     */
    const isValid = computed(() => Object.keys(formErrors.value).length === 0);

    /**
     * True when the form data differs from the baseline (JSON comparison, key order included).
     */
    const isDirty = computed(
        () => JSON.stringify(form.value) !== JSON.stringify(initialFormData.value)
    );

    /**
     * Merges partial data into the form.
     *
     * @param data - fields to overwrite; the rest keep their current value
     */
    const setForm = (data: Partial<T>) => {
        form.value = detachedCopy({ ...form.value, ...data }) as T;
    };

    /**
     * Resets the form to the baseline and clears all errors.
     */
    const resetForm = () => {
        form.value = detachedCopy(initialFormData.value);
        formErrors.value = {};
    };

    /**
     * Replaces the baseline that resetForm() restores and isDirty compares against.
     * Leaves the live form alone — call resetForm() (or use activateAutoHydrate) to apply it.
     *
     * @param data - the new baseline, detached-copied
     */
    const setInitialData = (data: T) => {
        initialFormData.value = detachedCopy(data);
    };

    /**
     * Clears all validation errors.
     */
    const clearErrors = () => {
        formErrors.value = {};
    };

    /**
     * Sets the validation error(s) of one field, replacing what it had.
     *
     * @param field  - the form field the messages belong to
     * @param errors - a single message or an array of messages
     */
    const setFieldError = (field: keyof T, errors: string | string[]) => {
        formErrors.value = {
            ...formErrors.value,
            [field]: Array.isArray(errors) ? errors : [errors]
        };
    };

    /**
     * Removes the validation errors of one field.
     *
     * @param field - the form field to clear
     */
    const clearFieldError = (field: keyof T) => {
        const { [field]: _removed, ...rest } = formErrors.value;
        formErrors.value = rest as Partial<Record<keyof T, string[]>>;
    };

    /**
     * Validates the current form value against the schema (if provided).
     * Replaces {@link formErrors} with the outcome.
     *
     * @returns true when validation passes (or no schema is set), false otherwise
     */
    const validate = (): boolean => {
        const resolvedSchema = toValue(schema);
        if (!resolvedSchema) {
            formErrors.value = {};
            return true;
        }

        const result = resolvedSchema.safeParse(form.value);

        if (result.success) {
            formErrors.value = {};
            return true;
        }

        const errors: Partial<Record<keyof T, string[]>> = {};
        for (const issue of result.error.issues) {
            // Zod: `path` is the key trail to the failing value; keep only the top-level field.
            // An empty path is a root-level issue, which has no field to attach to.
            const field = issue.path[0] as keyof T;
            if (field === undefined) continue;
            if (!errors[field]) errors[field] = [];
            errors[field]!.push(issue.message);
        }
        formErrors.value = errors;

        return false;
    };

    /**
     * Moves focus to the first invalid field, for accessibility after a failed submit.
     * A no-op without formElement, and tolerant of what it finds: the selector is
     * caller-configurable, so only something with a callable focus is worth acting on.
     */
    const focusFirstInvalidField = (): void => {
        const container = toValue(options.formElement);
        if (!container) return;
        const field = container.querySelector(
            options.invalidFieldSelector ?? DEFAULT_INVALID_FIELD_SELECTOR
        );
        if (isRecord(field) && typeof field.focus === 'function')
            (field.focus as () => void).call(field);
    };

    /**
     * Puts the errors already in formErrors on screen: showFormErrors on, wait for the render,
     * focus the first invalid field, call onInvalid.
     *
     * The wait is why this is a function and not an assignment: fields only acquire their invalid
     * markers once showFormErrors has propagated, so focusing any earlier finds nothing.
     *
     * Called by handleSubmit; call it directly when you validate by hand.
     *
     * @returns a promise resolving once focus and onInvalid have run
     */
    const revealErrors = (): Promise<void> =>
        Promise.resolve()
            .then(() => {
                showFormErrors.value = true;
                // Vue: resolves after the DOM has re-rendered with the invalid markers
                return nextTick();
            })
            .then(() => {
                focusFirstInvalidField();
                options.onInvalid?.(formErrors.value);
            });

    /**
     * Attaches the errors an API rejected a submit with to the fields they belong to, and reveals
     * them: server-only rules (uniqueness, cross-record) become red text under the right input.
     *
     * Merges onto what is already displayed rather than replacing it: an API that answered about
     * one field said nothing about the others, and clearing them invents an all-clear.
     *
     * @param error   - the rejected value, exactly as caught
     * @param options - see {@link IApplyServerErrorsOptions}
     * @returns true when at least one field error was attached. false means the rejection carried
     *          nothing displayable, i.e. the caller still owes the user a message
     */
    const applyServerErrors = (
        error: unknown,
        { map, onUnmapped }: IApplyServerErrorsOptions<T> = {}
    ): boolean => {
        const entries = normalizeServerErrors(findErrorCollection(error));
        const applied: Partial<Record<keyof T, string[]>> = {};
        const unmapped: string[] = [];

        for (const { field, messages } of entries) {
            const target = field === undefined ? undefined : ((map?.[field] ?? field) as keyof T);
            // A field the form does not have cannot be highlighted, so it is form-level copy
            if (target === undefined || !(target in form.value)) {
                unmapped.push(...messages);
                continue;
            }
            applied[target] = [...(applied[target] ?? []), ...messages];
        }

        if (unmapped.length > 0) onUnmapped?.(unmapped);

        const fields = Object.keys(applied) as (keyof T)[];
        if (fields.length === 0) return false;

        formErrors.value = { ...formErrors.value, ...applied };
        showFormErrors.value = true;
        return true;
    };

    /**
     * Validates (optionally) and then calls the provided submit handler.
     * Sets {@link isSubmitting} for the duration of the async operation.
     *
     * Owns showFormErrors across the whole flow: a rejected submit reveals (see revealErrors),
     * an accepted one hides. A handler that THROWS leaves it off — an API failure is not a
     * statement about any field; catch it and call applyServerErrors when it is.
     *
     * @param onSubmit       - handler called with the current form value
     * @param withValidation - when true (default) the form is validated first
     * @returns true on success, false when validation failed; a handler failure rejects
     */
    const handleSubmit = (
        onSubmit: (data: T) => Promise<void> | void,
        withValidation = true
    ): Promise<boolean> => {
        if (withValidation && !validate()) return revealErrors().then(() => false);

        showFormErrors.value = false;
        isSubmitting.value = true;

        // Promise.resolve wraps a handler that returns nothing, so a synchronous throw inside it
        // still reaches the caller as a rejection instead of escaping this call frame
        return Promise.resolve()
            .then(() => onSubmit(form.value))
            .then(() => true)
            .finally(() => {
                isSubmitting.value = false;
            });
    };

    /**
     * Auto-hydrates the form from a source (e.g. a fetched record): every defined value becomes
     * the new baseline (setInitialData) and is applied to the form (resetForm).
     *
     * @param currentItem - reactive source to watch, e.g. selectedRecord from useStructureRestApi
     * @returns the underlying watch handle (call it to stop watching)
     */
    const activateAutoHydrate = (currentItem: WatchSource<T | undefined | null>) =>
        watch(
            currentItem,
            (item) => {
                if (!item) return;
                setInitialData(item);
                resetForm();
            },
            { immediate: true } // hydrate right away when the record is already loaded
        );

    // Re-translates what is already on screen (see IStructureFormValidationOptions.revalidateOn):
    // validate() is deterministic on form.value, so the errors stay and their messages refresh.
    // The isValid guard keeps a pristine form from turning red.
    if (options.revalidateOn)
        // Vue: one source or an array of them; fires on change only (not immediately)
        watch(options.revalidateOn, () => {
            if (!isValid.value) validate();
        });

    return {
        form,
        formErrors,
        showFormErrors,
        isSubmitting,
        isValid,
        isDirty,
        setForm,
        resetForm,
        setInitialData,
        activateAutoHydrate,
        clearErrors,
        setFieldError,
        clearFieldError,
        applyServerErrors,
        validate,
        revealErrors,
        handleSubmit
    };
};

/**
 * Everything {@link useStructureFormValidation} returns, for consumers that need to name the
 * shape (a store that re-exports it, a component prop, a test helper).
 */
export type IStructureFormValidation<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string, any> = Record<string, any>
> = ReturnType<typeof useStructureFormValidation<T>>;
