import { computed, ref, toValue, watch, type MaybeRefOrGetter, type WatchSource } from 'vue';
import { type ZodType } from 'zod';

/**
 * Form management composable.
 * Handles reactive form state, optional Zod schema validation and submission flow.
 *
 * @param initialData - Initial values for the form fields
 * @param schema      - Optional Zod schema used for validation. Accepts a plain schema,
 *                      a ref, or a getter (e.g. `() => createUsersSchema(t)`) so schemas
 *                      built from i18n-dependent messages stay current after a locale
 *                      switch instead of being frozen at setup time.
 */
export const useStructureFormValidation = <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends Record<string, any> = Record<string, any>
>(
    initialData: T = {} as T,
    schema?: MaybeRefOrGetter<ZodType<T> | undefined>
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
     * Validate (optionally) and then call the provided submit handler.
     * Sets {@link isSubmitting} for the duration of the async operation.
     *
     * @param onSubmit       - handler called with the current form value
     * @param withValidation - when true (default) the form is validated first
     * @returns true on success, false when validation failed or an error was thrown
     */
    const handleSubmit = async (
        onSubmit: (data: T) => Promise<void> | void,
        withValidation = true
    ): Promise<boolean> => {
        if (withValidation && !validate()) return false;

        isSubmitting.value = true;
        try {
            await onSubmit(form.value);
            return true;
        } finally {
            isSubmitting.value = false;
        }
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
        validate,
        handleSubmit
    };
};
