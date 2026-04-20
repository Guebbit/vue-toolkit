import { FormApi, useStore } from '@tanstack/vue-form';
import { computed, ref } from 'vue';
import { type ZodType } from 'zod';

const fallbackDeepClone = <T>(value: T): T => {
    if (Array.isArray(value)) return value.map((item) => fallbackDeepClone(item)) as T;
    if (value && typeof value === 'object') {
        const result = {} as Record<string, unknown>;
        for (const [key, nestedValue] of Object.entries(value)) {
            result[key] = fallbackDeepClone(nestedValue);
        }
        return result as T;
    }
    return value;
};

const deepClone = <T>(value: T): T => {
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(value);
        } catch {
            return fallbackDeepClone(value);
        }
    }
    return fallbackDeepClone(value);
};

/**
 * Form management composable.
 * Handles reactive form state, optional Zod schema validation and submission flow.
 *
 * @param initialData - Initial values for the form fields
 * @param schema      - Optional Zod schema used for validation
 */
export const useStructureFormValidation = <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends Record<string, any> = Record<string, any>
>(
    initialData: T = {} as T,
    schema?: ZodType<T>
) => {
    /**
     * Upgrade note:
     * Form state/submission are now powered by TanStack Form.
     * Public return keys are kept for backward compatibility.
     */
    const normalizeFieldErrors = (errors: Record<string, string[]>) => {
        const normalized = {} as Partial<Record<keyof T, string[]>>;
        for (const [field, messages] of Object.entries(errors)) {
            normalized[field as keyof T] = messages;
        }
        return normalized;
    };

    const buildFieldErrorsFromSchema = (value: T): Record<string, string[]> => {
        if (!schema) return {};
        const result = schema.safeParse(value);
        if (result.success) return {};

        const fieldErrors: Record<string, string[]> = {};
        for (const issue of result.error.issues) {
            const field = issue.path[0];
            if (field === undefined) continue;
            const key = String(field);
            if (!fieldErrors[key]) fieldErrors[key] = [];
            fieldErrors[key].push(issue.message);
        }

        return fieldErrors;
    };

    const legacyFormErrors = ref<Partial<Record<keyof T, string[]>>>({});

    const applyFieldErrors = (errors: Record<string, string[]>) => {
        const fields = Object.fromEntries(
            Object.entries(errors).map(([field, messages]) => [
                field,
                messages.length === 1 ? messages[0] : messages
            ])
        );

        legacyFormErrors.value = normalizeFieldErrors(errors);
        formApi.setErrorMap(
            Object.keys(fields).length > 0
                ? ({
                      onSubmit: {
                          fields
                      }
                  } as never)
                : {}
        );
    };

    let submitHandler: ((data: T) => Promise<void> | void) | undefined;

    const formApi = new FormApi<
        T,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined
    >({
        defaultValues: deepClone(initialData),
        onSubmit: async ({ value }) => {
            if (!submitHandler) return;
            await submitHandler(value);
        }
    });
    formApi.mount();

    const formState = useStore(formApi.store, (state) => state);

    /**
     * Reactive form data
     */
    const form = ref<T>(deepClone(initialData));

    const syncFormToApi = (value: T) => {
        for (const [key, fieldValue] of Object.entries(value)) {
            formApi.setFieldValue(key as never, fieldValue as never);
        }
    };

    /**
     * Per-field validation errors.
     * Each key maps to a list of error messages for that field.
     */
    const formErrors = computed<Partial<Record<keyof T, string[]>>>(() => legacyFormErrors.value);

    /**
     * Whether a submission is currently in progress
     */
    const isSubmitting = computed(() => formState.value.isSubmitting);

    /**
     * True when there are no validation errors
     */
    const isValid = computed(() => Object.keys(formErrors.value).length === 0);

    /**
     * True when the form data differs from the initial values
     */
    const isDirty = computed(() => JSON.stringify(form.value) !== JSON.stringify(initialData));

    /**
     * Merge partial data into the form
     *
     * @param data
     */
    const setForm = (data: Partial<T>) => {
        form.value = { ...form.value, ...data } as T;
        syncFormToApi(form.value);
    };

    /**
     * Reset form to initial values and clear all errors
     */
    const resetForm = () => {
        form.value = deepClone(initialData);
        formApi.reset(deepClone(initialData));
        applyFieldErrors({});
    };

    /**
     * Clear all validation errors
     */
    const clearErrors = () => {
        applyFieldErrors({});
    };

    /**
     * Set validation error(s) for a specific field
     *
     * @param field
     * @param errors - a single message or an array of messages
     */
    const setFieldError = (field: keyof T, errors: string | string[]) => {
        const currentErrors = Object.fromEntries(
            Object.entries(formErrors.value).map(([key, messages]) => [key, messages ?? []])
        ) as Record<string, string[]>;
        currentErrors[String(field)] = Array.isArray(errors) ? errors : [errors];
        applyFieldErrors(currentErrors);
    };

    /**
     * Remove validation errors for a specific field
     *
     * @param field
     */
    const clearFieldError = (field: keyof T) => {
        const currentErrors = Object.fromEntries(
            Object.entries(formErrors.value).map(([key, messages]) => [key, messages ?? []])
        ) as Record<string, string[]>;
        delete currentErrors[String(field)];
        applyFieldErrors(currentErrors);
    };

    /**
     * Validate the current form value against the schema (if provided).
     * Updates {@link formErrors} reactively.
     *
     * @returns true when validation passes (or no schema is set), false otherwise
     */
    const validate = (): boolean => {
        const fieldErrors = buildFieldErrorsFromSchema(form.value);
        applyFieldErrors(fieldErrors);
        return Object.keys(fieldErrors).length === 0;
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
        syncFormToApi(form.value);
        submitHandler = onSubmit;
        await formApi.handleSubmit();
        return true;
    };

    return {
        form,
        formErrors,
        isSubmitting,
        isValid,
        isDirty,
        setForm,
        resetForm,
        clearErrors,
        setFieldError,
        clearFieldError,
        validate,
        handleSubmit
    };
};
