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
    type ComputedRef,
    type MaybeRefOrGetter,
    type Ref,
    type WatchSource,
    type WatchStopHandle
} from 'vue';
import { detachedCopy, stableKey } from '../internal/plainData.js';

/**
 * In practice the form element, declared structurally so this composable never names a DOM type.
 */
export interface IFieldContainer {
    /** Finds the field to focus; the result is only runtime-checked for a callable `focus`. */
    querySelector: (selectors: string) => unknown;
}

/**
 * One validation failure at a specific path into the value (Zod's own `ZodIssue` shape). An empty
 * `path` is a root-level issue — see {@link IStructureFormValidationOptions.revalidateOn}.
 */
export interface IValidationIssue {
    /** The key trail to the failing value; empty for a root-level issue. */
    path: PropertyKey[];

    /** A human-readable description of the failure. */
    message: string;
}

/**
 * The minimal shape {@link useStructureFormValidation}'s `schema` option needs: Zod's own
 * `safeParse` contract, described structurally so this package's `.d.ts` never imports Zod's
 * types (Zod is an OPTIONAL peer — an app without it installed must still type-check). Any real
 * Zod schema (`z.object({...})`, `ZodType<T>`) satisfies this as-is; nothing to wrap or convert.
 */
export interface IValidationSchema<T> {
    /**
     * Parses `data`, never throwing.
     *
     * @param data - the value to validate
     */
    safeParse(
        data: unknown
    ): { success: true; data: T } | { success: false; error: { issues: IValidationIssue[] } };
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
     * any field the form does not have. Without it they go to {@link IStructureFormValidation.formLevelErrors}
     * instead.
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
 * `record[key]`, own keys only: a plain object also answers for `constructor` or `toString`
 * through its prototype, and a field of that name must not read as one already there.
 *
 * @param record - the object to read, if any
 * @param key - the key to read
 * @returns the own value, or undefined
 */
const ownValue = <V>(record: object | undefined, key: PropertyKey): V | undefined =>
    record !== undefined && Object.hasOwn(record, key)
        ? (record as Record<PropertyKey, V>)[key]
        : undefined;

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
 * Everything {@link useStructureFormValidation} returns, for consumers that need to name the
 * shape (a store that re-exports it, a component prop, a test helper). An explicit interface, not
 * `ReturnType<typeof ...>`: the inferred type reaches into Vue's own `@vue/reactivity`/
 * `@vue/shared` internals, which do not resolve under a strict (pnpm) `node_modules` layout.
 */
export interface IStructureFormValidation<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string, any> = Record<string, any>
> {
    /** Live form values, bound to the inputs. */
    form: Ref<T>;

    /** Per-field validation errors: top-level field name -> its messages. */
    formErrors: Ref<Partial<Record<keyof T, string[]>>>;

    /** Errors that belong to no single field: a root-level Zod issue, or an unmapped server one. */
    formLevelErrors: Ref<string[]>;

    /** Whether errors should be displayed. */
    showFormErrors: Ref<boolean>;

    /** Whether a handleSubmit handler is currently running; while it is, no other one starts. */
    isSubmitting: Ref<boolean>;

    /** True when there are no validation errors, field-level or form-level. */
    isValid: ComputedRef<boolean>;

    /** True when the form data differs from the baseline. */
    isDirty: ComputedRef<boolean>;

    /**
     * Merges partial data into the form.
     *
     * @param data - fields to overwrite; the rest keep their current value
     */
    setForm: (data: Partial<T>) => void;

    /** Resets the form to the baseline and clears all errors, schema- and server-tracked alike. */
    resetForm: () => void;

    /**
     * Replaces the baseline resetForm() restores and isDirty compares against.
     *
     * @param data - the new baseline, detached-copied
     */
    setInitialData: (data: T) => void;

    /**
     * Watches a reactive source and, on every defined value, adopts it as the new baseline and
     * applies it to the form.
     *
     * @param currentItem - reactive source to watch, e.g. selectedRecord from useStructureRestApi
     * @returns the underlying watch handle (call it to stop watching)
     */
    activateAutoHydrate: (currentItem: WatchSource<T | undefined | null>) => WatchStopHandle;

    /** Clears all validation errors, field-level, form-level and server-tracked alike. */
    clearErrors: () => void;

    /**
     * Sets the validation error(s) of one field, replacing what it had.
     *
     * @param field  - the form field the messages belong to
     * @param errors - a single message or an array of messages
     */
    setFieldError: (field: keyof T, errors: string | string[]) => void;

    /**
     * Removes the validation errors of one field, schema- and server-tracked alike.
     *
     * @param field - the form field to clear
     */
    clearFieldError: (field: keyof T) => void;

    /**
     * Attaches a rejection's errors to the fields they belong to, and reveals them.
     *
     * @param error   - the rejected value, exactly as caught
     * @param options - see {@link IApplyServerErrorsOptions}
     * @returns true when something was shown to the user, on the form or through `onUnmapped`
     */
    applyServerErrors: (error: unknown, options?: IApplyServerErrorsOptions<T>) => boolean;

    /**
     * Validates the current form value against the schema (if provided).
     *
     * @returns true when validation passes (or no schema is set), false otherwise
     */
    validate: () => boolean;

    /**
     * Puts the errors already in formErrors on screen: showFormErrors on, focus the first invalid
     * field, call onInvalid.
     *
     * @returns a promise resolving once focus and onInvalid have run
     */
    revealErrors: () => Promise<void>;

    /**
     * Validates (optionally) and then calls the provided submit handler. One submit at a time:
     * called while another is still running, it resolves false without validating or calling
     * its handler.
     *
     * @param onSubmit       - handler called with the current form value
     * @param withValidation - when true (default) the form is validated first
     * @returns true on success; false when the handler did not run (validation failed, or another
     *   submit was still running); a handler failure rejects
     */
    handleSubmit: (
        onSubmit: (data: T) => Promise<void> | void,
        withValidation?: boolean
    ) => Promise<boolean>;
}

/**
 * Form management composable.
 * Handles reactive form state, optional Zod schema validation and submission flow.
 *
 * @param initialData - initial values for the form fields, and the first reset baseline
 * @param schema      - optional Zod schema (or anything structurally matching
 *                      {@link IValidationSchema}): plain, ref or getter, resolved inside
 *                      `validate()` only. Prefer a plain schema with thunk messages
 *                      (`error: () => t('…')`): a getter accidentally called at the call site
 *                      freezes the language.
 * @param options     - see {@link IStructureFormValidationOptions}
 * @returns form state (`form`, `formErrors`, flags) and the actions that drive it
 */
export const useStructureFormValidation = <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the record constraint (see CLAUDE.md)
    T extends Record<string, any> = Record<string, any>
>(
    initialData: T = {} as T,
    schema?: MaybeRefOrGetter<IValidationSchema<T> | undefined>,
    options: IStructureFormValidationOptions<T> = {}
): IStructureFormValidation<T> => {
    /**
     * Baseline values resetForm() restores and isDirty compares against.
     * Starts as a detached copy of initialData (nested fields included — a shallow copy would
     * leave a hydrated `readonly` record's nested objects read-only here too); setInitialData /
     * activateAutoHydrate replace it, so a record fetched later can become the new baseline. Cast
     * past UnwrapRef, same reason as `form`: `.value` feeds straight into `form`'s own writes.
     */
    const initialFormData = ref<T>(detachedCopy(initialData)) as Ref<T>;

    /**
     * Live form values, bound to the inputs. A detached copy: never shares nested objects with
     * the baseline. Cast past UnwrapRef: T can involve `any`, which defeats Vue's ref-unwrapping
     * inference and would otherwise widen `.value` to something `IStructureFormValidation`'s plain
     * `Ref<T>` can't structurally match. Purely a type-level fix — ref() doesn't act on this at
     * runtime.
     */
    const form = ref<T>(detachedCopy(initialFormData.value)) as Ref<T>;

    /**
     * Per-field validation errors: top-level field name -> its messages. Cast past UnwrapRef, same
     * reason as `form`.
     * Holds resolved strings, so a language change needs a re-validate (see `revalidateOn`).
     */
    const formErrors = ref<Partial<Record<keyof T, string[]>>>({}) as Ref<
        Partial<Record<keyof T, string[]>>
    >;

    /**
     * Errors that belong to no single field: a root-level Zod issue (empty `path`), or a server
     * error `applyServerErrors` could not map to a field and no `onUnmapped` was given to catch.
     * Without this, either would be silently dropped — `isValid` true and nothing shown, even
     * though the submit actually failed.
     */
    const formLevelErrors = ref<string[]>([]);

    /**
     * Errors set via `applyServerErrors`/`setFieldError`, tracked apart from the schema's own
     * result so a `revalidateOn` re-parse (see below) can merge them back over it instead of
     * wiping them: they came from the server or the caller, not from `form`, so re-parsing
     * `form` has nothing to say about whether they still apply. Cast past UnwrapRef, same reason
     * as `formErrors`.
     */
    const serverErrors = ref<Partial<Record<keyof T, string[]>>>({}) as Ref<
        Partial<Record<keyof T, string[]>>
    >;

    /**
     * The unmapped-message subset of `formLevelErrors` that came from `applyServerErrors`,
     * tracked apart for the same reason as `serverErrors`: a `revalidateOn` re-parse only knows
     * about the schema's own root-level issues, so without this it would drop these on re-parse.
     */
    const serverLevelErrors = ref<string[]>([]);

    /**
     * Whether errors should be displayed.
     * Separate from `formErrors` so validation can run silently; handleSubmit and revealErrors
     * turn it on, an accepted submit turns it off.
     */
    const showFormErrors = ref(false);

    /**
     * Whether a handleSubmit handler is currently running. Also handleSubmit's lock: while it is
     * true, no other submit starts.
     */
    const isSubmitting = ref(false);

    /**
     * True when there are no validation errors, field-level or form-level.
     */
    const isValid = computed(
        () => Object.keys(formErrors.value).length === 0 && formLevelErrors.value.length === 0
    );

    /**
     * True when the form data differs from the baseline. Compared by `stableKey` (canonical JSON:
     * property order never counts as a change), not raw `JSON.stringify` — which also lets it see
     * a Set/Map field's own content instead of comparing two `"{}"` strings.
     */
    const isDirty = computed(() => stableKey(form.value) !== stableKey(initialFormData.value));

    /**
     * Merges partial data into the form.
     *
     * @param data - fields to overwrite; the rest keep their current value
     */
    const setForm = (data: Partial<T>) => {
        form.value = detachedCopy({ ...form.value, ...data }) as T;
    };

    /**
     * Resets the form to the baseline and clears all errors, schema- and server-tracked alike.
     */
    const resetForm = () => {
        form.value = detachedCopy(initialFormData.value);
        formErrors.value = {};
        formLevelErrors.value = [];
        serverErrors.value = {};
        serverLevelErrors.value = [];
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
     * Clears all validation errors, field-level, form-level and server-tracked alike.
     */
    const clearErrors = () => {
        formErrors.value = {};
        formLevelErrors.value = [];
        serverErrors.value = {};
        serverLevelErrors.value = [];
    };

    /**
     * Sets the validation error(s) of one field, replacing what it had. Tracked as a server-set
     * error (see `serverErrors`): a `revalidateOn` re-parse merges it back rather than wiping it.
     *
     * @param field  - the form field the messages belong to
     * @param errors - a single message or an array of messages
     */
    const setFieldError = (field: keyof T, errors: string | string[]) => {
        const messages = Array.isArray(errors) ? errors : [errors];
        formErrors.value = { ...formErrors.value, [field]: messages };
        serverErrors.value = { ...serverErrors.value, [field]: messages };
    };

    /**
     * Removes the validation errors of one field, schema- and server-tracked alike.
     *
     * @param field - the form field to clear
     */
    const clearFieldError = (field: keyof T) => {
        const { [field]: _removed, ...rest } = formErrors.value;
        formErrors.value = rest as Partial<Record<keyof T, string[]>>;
        const { [field]: _removedServer, ...restServer } = serverErrors.value;
        serverErrors.value = restServer as Partial<Record<keyof T, string[]>>;
    };

    /**
     * Re-parses the current form value against the schema (if provided), without touching
     * {@link formErrors}/{@link formLevelErrors}/{@link serverErrors}. The shared core of
     * `validate()` and the `revalidateOn` re-parse, which differ only in what they do with the
     * result: `validate()` replaces the display state wholesale, `revalidateOn` merges it under
     * the still-live server errors.
     */
    const parseSchema = (): {
        success: boolean;
        fieldErrors: Partial<Record<keyof T, string[]>>;
        levelErrors: string[];
    } => {
        const resolvedSchema = toValue(schema);
        if (!resolvedSchema) return { success: true, fieldErrors: {}, levelErrors: [] };

        const result = resolvedSchema.safeParse(form.value);
        if (result.success) return { success: true, fieldErrors: {}, levelErrors: [] };

        const fieldErrors: Partial<Record<keyof T, string[]>> = {};
        const levelErrors: string[] = [];
        for (const issue of result.error.issues) {
            // Zod: `path` is the key trail to the failing value; keep only the top-level field.
            // An empty path is a root-level issue, which has no field to attach to — it goes to
            // levelErrors instead of being dropped.
            const field = issue.path[0] as keyof T;
            if (field === undefined) {
                levelErrors.push(issue.message);
                continue;
            }
            fieldErrors[field] = [...(ownValue<string[]>(fieldErrors, field) ?? []), issue.message];
        }
        return { success: false, fieldErrors, levelErrors };
    };

    /**
     * Validates the current form value against the schema (if provided).
     * Replaces {@link formErrors} and {@link formLevelErrors} with the outcome, and clears
     * {@link serverErrors}: an explicit validate() is a fresh submit attempt, and the server will
     * answer again.
     *
     * @returns true when validation passes (or no schema is set), false otherwise
     */
    const validate = (): boolean => {
        const outcome = parseSchema();
        formErrors.value = outcome.fieldErrors;
        formLevelErrors.value = outcome.levelErrors;
        serverErrors.value = {};
        serverLevelErrors.value = [];
        return outcome.success;
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
     * them: server-only rules (uniqueness, cross-record) become red text under the right input. A
     * message that names no field the form has goes to {@link formLevelErrors} instead, unless
     * `onUnmapped` is given, which then owns displaying it.
     *
     * Merges onto what is already displayed rather than replacing it: an API that answered about
     * one field said nothing about the others, and clearing them invents an all-clear.
     *
     * @param error   - the rejected value, exactly as caught
     * @param options - see {@link IApplyServerErrorsOptions}
     * @returns true when something was shown to the user, on the form or through `onUnmapped`.
     *          false means the rejection carried nothing at all — the caller still owes the user
     *          a message
     */
    const applyServerErrors = (
        error: unknown,
        { map, onUnmapped }: IApplyServerErrorsOptions<T> = {}
    ): boolean => {
        const entries = normalizeServerErrors(findErrorCollection(error));
        const applied: Partial<Record<keyof T, string[]>> = {};
        const unmapped: string[] = [];

        for (const { field, messages } of entries) {
            const target =
                field === undefined ? undefined : (ownValue<keyof T>(map, field) ?? field);
            // A field the form does not have cannot be highlighted, so it is form-level copy
            if (target === undefined || !Object.hasOwn(form.value, target)) {
                unmapped.push(...messages);
                continue;
            }
            applied[target] = [...(ownValue<string[]>(applied, target) ?? []), ...messages];
        }

        // onUnmapped, when given, owns displaying these; without it they go to formLevelErrors
        // instead of being silently dropped.
        const displayedUnmapped = unmapped.length > 0 && !onUnmapped;
        if (unmapped.length > 0 && onUnmapped) onUnmapped(unmapped);

        const fields = Object.keys(applied) as (keyof T)[];

        if (fields.length > 0) {
            formErrors.value = { ...formErrors.value, ...applied };
            serverErrors.value = { ...serverErrors.value, ...applied };
        }
        if (displayedUnmapped) {
            formLevelErrors.value = [...formLevelErrors.value, ...unmapped];
            serverLevelErrors.value = [...serverLevelErrors.value, ...unmapped];
        }
        // showFormErrors only turns on when the FORM itself displays something; onUnmapped owns
        // its own display (e.g. a toast), so it does not also reveal the (empty) form errors.
        if (fields.length > 0 || displayedUnmapped) showFormErrors.value = true;
        return fields.length > 0 || unmapped.length > 0;
    };

    /**
     * Validates (optionally) and then calls the provided submit handler.
     * Sets {@link isSubmitting} for the duration of the async operation.
     *
     * Single-flight: a submit arriving while one runs (a double click, Enter plus a click) would
     * repeat the handler's side effects, a duplicate POST — so it resolves false untouched.
     *
     * Owns showFormErrors across the whole flow: a rejected submit reveals (see revealErrors),
     * an accepted one hides. A handler that THROWS leaves it off — an API failure is not a
     * statement about any field; catch it and call applyServerErrors when it is.
     *
     * @param onSubmit       - handler called with the current form value
     * @param withValidation - when true (default) the form is validated first
     * @returns true on success; false when the handler did not run (validation failed, or another
     *   submit was still running); a handler failure rejects
     */
    const handleSubmit = (
        onSubmit: (data: T) => Promise<void> | void,
        withValidation = true
    ): Promise<boolean> => {
        if (isSubmitting.value) return Promise.resolve(false);
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
    // a fresh schema parse is deterministic on form.value, so the messages refresh. Merged UNDER
    // serverErrors rather than assigned outright, so a server-set field error (setFieldError /
    // applyServerErrors) survives — the schema has nothing to say about whether it still applies.
    // The isValid guard keeps a pristine form from turning red.
    if (options.revalidateOn)
        // Vue: one source or an array of them; fires on change only (not immediately)
        watch(options.revalidateOn, () => {
            if (isValid.value) return;
            const outcome = parseSchema();
            formErrors.value = { ...outcome.fieldErrors, ...serverErrors.value };
            formLevelErrors.value = [...outcome.levelErrors, ...serverLevelErrors.value];
        });

    return {
        form,
        formErrors,
        formLevelErrors,
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
