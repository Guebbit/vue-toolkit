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

/**
 * In practice the form element, declared structurally so this composable never names a DOM type
 * (the result is only ever runtime-checked for a callable `focus`).
 */
export interface IFieldContainer {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends Record<string, any> = Record<string, any>
> {
    /**
     * Sources that, when they change, re-run validation over the UNCHANGED form data.
     *
     * The case this exists for is a language switch. Zod hands back resolved message
     * *strings*, and {@link useStructureFormValidation} copies them into `formErrors`, so once
     * `validate()` has returned those strings are inert text: the schema is out of the picture
     * and re-rendering the component just re-prints the same English error under a now-Italian
     * label. Re-parsing the same data produces the same set of errors with different strings.
     *
     * Deliberately generic rather than a `locale` option: the toolkit must not know that
     * vue-i18n exists, and "re-validate when X changes" covers other reasons too (a unit
     * system, a tenant's rules). Pass `i18n.global.locale` and you have the i18n behaviour.
     *
     * Only fires for a form that has errors on display. A pristine form the user has not
     * submitted yet must not sprout red text just because they changed the language.
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
     * @param errors
     */
    onInvalid?: (errors: Partial<Record<keyof T, string[]>>) => void;
}

/**
 * How applyServerErrors was told to read a rejection.
 */
export interface IApplyServerErrorsOptions<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends Record<string, any> = Record<string, any>
> {
    /**
     * Renames server field names to form field names (`user_email` -> `email`).
     * Names absent from the map are used as-is, so only the exceptions need listing.
     */
    map?: Record<string, keyof T>;

    /**
     * Receives messages that could not be attached to a field: the API's form-level errors, and
     * any field the form does not have. Without it they are dropped, which is what makes people
     * distrust server-side validation — the API said no, and the screen says nothing.
     */
    onUnmapped?: (messages: string[]) => void;
}

/**
 * One server-reported error: the field it belongs to (if any) and what to say about it.
 */
interface IServerErrorEntry {
    field?: string;
    messages: string[];
}

/**
 * Narrows any value to a plain keyed object.
 *
 * @param value
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

/**
 * Coerce a server-supplied message value — one string or a list — into a clean list.
 *
 * @param value
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
 * Read the field name out of one entry of an array-shaped error list.
 *
 * Covers `field`, `name`, `param` (express-validator) and `path` (a string, or the array Zod
 * emits). Nested paths collapse to their root, since formErrors is keyed by top-level field —
 * the same thing validate() does with Zod issues.
 *
 * @param entry
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
 * Find the error collection inside a rejection, wherever the transport left it: the value itself
 * (a normalized envelope), `.data` (an unwrapped body), or `.response.data` (a raw axios error).
 *
 * @param error
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
 * Flatten whichever shape the API used into a uniform entry list:
 *  - field map, `{ email: 'Taken', password: ['Too short'] }`
 *  - list of objects, `[{ field: 'email', message: 'Taken' }]`
 *  - list of strings, which carry no field and become form-level messages
 *
 * @param collection
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
            .filter(({ messages }) => messages.length > 0);

    if (isRecord(collection))
        return Object.entries(collection)
            .map(([field, value]): IServerErrorEntry => ({ field, messages: asMessages(value) }))
            .filter(({ messages }) => messages.length > 0);

    return [];
};

/**
 * Form management composable.
 * Handles reactive form state, optional Zod schema validation and submission flow.
 *
 * @param initialData - Initial values for the form fields
 * @param schema      - Optional Zod schema used for validation. Accepts a plain schema, a ref,
 *                      or a getter. `toValue` is applied inside `validate()` and nowhere else,
 *                      so a plain schema whose messages are thunks (`error: () => t('…')`) is
 *                      resolved just as late as a getter would be — prefer the plain schema,
 *                      since a getter that is accidentally called at the call site
 *                      (`schema(t)` instead of `() => schema(t)`) type-checks, runs, and
 *                      silently freezes the language.
 * @param options     - See {@link IStructureFormValidationOptions}
 */
export const useStructureFormValidation = <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends Record<string, any> = Record<string, any>
>(
    initialData: T = {} as T,
    schema?: MaybeRefOrGetter<ZodType<T> | undefined>,
    options: IStructureFormValidationOptions<T> = {}
) => {
    /**
     * Baseline values resetForm() restores and isDirty compares against.
     * Starts as a copy of initialData, but is mutable via setInitialData so a
     * record fetched after this composable was created can become the new
     * baseline (see setInitialData / activateAutoHydrate).
     */
    const initialFormData = ref<T>({ ...initialData } as T);

    /**
     * Reactive form data
     */
    const form = ref<T>({ ...initialFormData.value } as T);

    /**
     * Per-field validation errors.
     * Each key maps to a list of error messages for that field.
     */
    const formErrors = ref<Partial<Record<keyof T, string[]>>>({});

    /**
     *
     */
    const showFormErrors = ref(false);

    /**
     * Whether a submission is currently in progress
     */
    const isSubmitting = ref(false);

    /**
     * True when there are no validation errors
     */
    const isValid = computed(() => Object.keys(formErrors.value).length === 0);

    /**
     * True when the form data differs from the initial values
     */
    const isDirty = computed(
        () => JSON.stringify(form.value) !== JSON.stringify(initialFormData.value)
    );

    /**
     * Merge partial data into the form
     *
     * @param data
     */
    const setForm = (data: Partial<T>) => {
        form.value = { ...form.value, ...data } as T;
    };

    /**
     * Reset form to initial values and clear all errors
     */
    const resetForm = () => {
        form.value = { ...initialFormData.value } as T;
        formErrors.value = {};
    };

    /**
     * Replace the baseline values that resetForm() restores and isDirty compares
     * against. Does not touch the live form or its errors by itself — call
     * resetForm() afterwards (or see activateAutoHydrate) to apply it to `form`.
     *
     * @param data
     */
    const setInitialData = (data: T) => {
        initialFormData.value = { ...data } as T;
    };

    /**
     * Clear all validation errors
     */
    const clearErrors = () => {
        formErrors.value = {};
    };

    /**
     * Set validation error(s) for a specific field
     *
     * @param field
     * @param errors - a single message or an array of messages
     */
    const setFieldError = (field: keyof T, errors: string | string[]) => {
        formErrors.value = {
            ...formErrors.value,
            [field]: Array.isArray(errors) ? errors : [errors]
        };
    };

    /**
     * Remove validation errors for a specific field
     *
     * @param field
     */
    const clearFieldError = (field: keyof T) => {
        const { [field]: _removed, ...rest } = formErrors.value;
        formErrors.value = rest as Partial<Record<keyof T, string[]>>;
    };

    /**
     * Validate the current form value against the schema (if provided).
     * Updates {@link formErrors} reactively.
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
            const field = issue.path[0] as keyof T;
            if (field === undefined) continue;
            if (!errors[field]) errors[field] = [];
            errors[field]!.push(issue.message);
        }
        formErrors.value = errors;

        return false;
    };

    /**
     * Move focus to the first invalid field, for accessibility after a failed submit.
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
     * Put the errors already in formErrors on screen: showFormErrors on, wait for the render,
     * focus the first invalid field, call onInvalid.
     *
     * The wait is why this is a function and not an assignment: fields only acquire their invalid
     * markers once showFormErrors has propagated, so focusing any earlier finds nothing.
     *
     * Called by handleSubmit; call it directly when you validate by hand.
     */
    const revealErrors = (): Promise<void> =>
        Promise.resolve()
            .then(() => {
                showFormErrors.value = true;
                return nextTick();
            })
            .then(() => {
                focusFirstInvalidField();
                options.onInvalid?.(formErrors.value);
            });

    /**
     * Attach the errors an API rejected a submit with to the fields they belong to, and reveal
     * them. Turns "uniqueness / cross-record rules the browser cannot check" into red text under
     * the right input instead of a generic toast.
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
     * Validate (optionally) and then call the provided submit handler.
     * Sets {@link isSubmitting} for the duration of the async operation.
     *
     * Owns showFormErrors across the whole flow, so no call site has to: a rejected submit
     * reveals (see revealErrors), an accepted one hides. A handler that THROWS leaves it off —
     * an API failure is not a statement about any field. Catch it and call applyServerErrors
     * when it is.
     *
     * @param onSubmit       - handler called with the current form value
     * @param withValidation - when true (default) the form is validated first
     * @returns true on success, false when validation failed or an error was thrown
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
     * Watches a source (e.g. a fetched record) and, whenever it resolves to a
     * defined value, adopts it as the new reset baseline (setInitialData) and
     * applies it to the form (resetForm) — so the form auto-hydrates once the
     * record arrives instead of staying on the original initialData passed to
     * this composable.
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
            { immediate: true }
        );

    /**
     * Re-translate what is already on screen — see {@link IStructureFormValidationOptions}.
     *
     * `validate()` is deterministic on `form.value`, so re-running it against unchanged data
     * yields the same set of errors with freshly-resolved messages. The `isValid` guard is what
     * keeps it from being destructive: with no errors showing there is nothing to re-translate,
     * and running anyway would splash red onto a form the user has not submitted yet.
     */
    if (options.revalidateOn)
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends Record<string, any> = Record<string, any>
> = ReturnType<typeof useStructureFormValidation<T>>;
