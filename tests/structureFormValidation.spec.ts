import { z } from 'zod';
import { nextTick, ref } from 'vue';
import { useStructureFormValidation } from '../src/composables/structureFormValidation';

interface ILoginForm {
    email: string;
    password: string;
}

const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters')
});

const INITIAL_LOGIN: ILoginForm = { email: '', password: '' };

/**
 * Stand-in for the form element: the composable only ever asks it for a descendant and tries to
 * focus what comes back, so a container and a field are all a test needs.
 */
const createForm = (field?: unknown) => ({
    querySelector: jest.fn().mockReturnValue(field)
});

/**
 * A login schema whose email message is a thunk, so the wording is decided at parse time.
 */
const localizedSchema = (message: () => string) =>
    z.object({
        email: z.string().email({ error: message }),
        password: z.string()
    });

describe('useStructureFormValidation', () => {
    let composable: ReturnType<typeof useStructureFormValidation<ILoginForm>>;

    beforeEach(() => {
        composable = useStructureFormValidation<ILoginForm>(INITIAL_LOGIN, loginSchema);
    });

    // ─── form reactive ref ────────────────────────────────────────────────────

    describe('form (reactive ref)', () => {
        it('initialises with the provided initial data', () => {
            expect(composable.form.value).toEqual(INITIAL_LOGIN);
        });

        it('is independent of the initial data object (deep copy)', () => {
            composable.form.value.email = 'mutated@test.com';
            expect(INITIAL_LOGIN.email).toBe('');
        });
    });

    // ─── setForm ──────────────────────────────────────────────────────────────

    describe('setForm', () => {
        it('merges partial data into the form', () => {
            composable.setForm({ email: 'john@example.com' });
            expect(composable.form.value.email).toBe('john@example.com');
            expect(composable.form.value.password).toBe('');
        });

        it('overwrites existing fields', () => {
            composable.setForm({ email: 'a@a.com' });
            composable.setForm({ email: 'b@b.com' });
            expect(composable.form.value.email).toBe('b@b.com');
        });
    });

    // ─── resetForm ───────────────────────────────────────────────────────────

    describe('resetForm', () => {
        it('restores form to initial data', () => {
            composable.setForm({ email: 'changed@test.com', password: 'hunter2' });
            composable.resetForm();
            expect(composable.form.value).toEqual(INITIAL_LOGIN);
        });

        it('clears all errors on reset', () => {
            composable.setFieldError('email', 'bad email');
            composable.resetForm();
            expect(composable.formErrors.value).toEqual({});
        });
    });

    // ─── setInitialData ──────────────────────────────────────────────────────

    describe('setInitialData', () => {
        it('changes the baseline resetForm() restores to', () => {
            composable.setInitialData({ email: 'fetched@test.com', password: 'fetchedPass' });
            composable.setForm({ email: 'edited@test.com' });
            composable.resetForm();
            expect(composable.form.value).toEqual({
                email: 'fetched@test.com',
                password: 'fetchedPass'
            });
        });

        it('does not itself touch the live form value', () => {
            composable.setInitialData({ email: 'fetched@test.com', password: 'fetchedPass' });
            expect(composable.form.value).toEqual(INITIAL_LOGIN);
        });

        it('shifts isDirty’s comparison baseline', () => {
            composable.setForm({ email: 'same@test.com', password: 'samePass' });
            composable.setInitialData({ email: 'same@test.com', password: 'samePass' });
            expect(composable.isDirty.value).toBe(false);
        });
    });

    // ─── activateAutoHydrate ─────────────────────────────────────────────────

    describe('activateAutoHydrate', () => {
        it('does nothing while the source is undefined', () => {
            const source = ref<ILoginForm | undefined>(undefined);
            composable.activateAutoHydrate(source);
            expect(composable.form.value).toEqual(INITIAL_LOGIN);
            expect(composable.isDirty.value).toBe(false);
        });

        it('adopts the source as the new baseline as soon as it resolves', async () => {
            const source = ref<ILoginForm | undefined>(undefined);
            composable.activateAutoHydrate(source);

            source.value = { email: 'hydrated@test.com', password: 'hydratedPass' };
            await nextTick();

            expect(composable.form.value).toEqual({
                email: 'hydrated@test.com',
                password: 'hydratedPass'
            });
            expect(composable.isDirty.value).toBe(false);
        });

        it('keeps hydrating the form on later source changes, discarding local edits', async () => {
            const source = ref<ILoginForm | undefined>({
                email: 'first@test.com',
                password: 'firstPass'
            });
            composable.activateAutoHydrate(source);
            await nextTick();

            composable.setForm({ email: 'locallyEdited@test.com' });

            source.value = { email: 'second@test.com', password: 'secondPass' };
            await nextTick();

            expect(composable.form.value).toEqual({
                email: 'second@test.com',
                password: 'secondPass'
            });
        });
    });

    // ─── isDirty ─────────────────────────────────────────────────────────────

    describe('isDirty', () => {
        it('is false when form matches initial data', () => {
            expect(composable.isDirty.value).toBe(false);
        });

        it('is true after a field is modified', () => {
            composable.setForm({ email: 'dirty@test.com' });
            expect(composable.isDirty.value).toBe(true);
        });

        it('returns to false after reset', () => {
            composable.setForm({ email: 'dirty@test.com' });
            composable.resetForm();
            expect(composable.isDirty.value).toBe(false);
        });
    });

    // ─── isValid ─────────────────────────────────────────────────────────────

    describe('isValid', () => {
        it('is true when there are no errors', () => {
            expect(composable.isValid.value).toBe(true);
        });

        it('is false after a field error is set', () => {
            composable.setFieldError('email', 'Invalid email');
            expect(composable.isValid.value).toBe(false);
        });

        it('returns to true after clearing errors', () => {
            composable.setFieldError('email', 'Invalid email');
            composable.clearErrors();
            expect(composable.isValid.value).toBe(true);
        });
    });

    // ─── setFieldError / clearFieldError ─────────────────────────────────────

    describe('setFieldError / clearFieldError', () => {
        it('sets a single error message for a field', () => {
            composable.setFieldError('email', 'Required');
            expect(composable.formErrors.value.email).toEqual(['Required']);
        });

        it('sets multiple error messages for a field', () => {
            composable.setFieldError('password', ['Too short', 'No uppercase']);
            expect(composable.formErrors.value.password).toEqual(['Too short', 'No uppercase']);
        });

        it('clears only the specified field error', () => {
            composable.setFieldError('email', 'bad');
            composable.setFieldError('password', 'weak');
            composable.clearFieldError('email');
            expect(composable.formErrors.value.email).toBeUndefined();
            expect(composable.formErrors.value.password).toEqual(['weak']);
        });
    });

    // ─── clearErrors ─────────────────────────────────────────────────────────

    describe('clearErrors', () => {
        it('removes all field errors', () => {
            composable.setFieldError('email', 'bad');
            composable.setFieldError('password', 'weak');
            composable.clearErrors();
            expect(composable.formErrors.value).toEqual({});
        });
    });

    // ─── validate (with schema) ───────────────────────────────────────────────

    describe('validate (with schema)', () => {
        it('returns false and populates errors when form is invalid', () => {
            const ok = composable.validate();
            expect(ok).toBe(false);
            expect(composable.formErrors.value.email).toBeDefined();
            expect(composable.formErrors.value.password).toBeDefined();
        });

        it('returns true and clears errors when form is valid', () => {
            composable.setForm({ email: 'valid@test.com', password: 'securePassword' });
            const ok = composable.validate();
            expect(ok).toBe(true);
            expect(composable.formErrors.value).toEqual({});
        });

        it('surfaces the correct zod error messages', () => {
            composable.setForm({ email: 'not-an-email', password: 'short' });
            composable.validate();
            expect(composable.formErrors.value.email).toContain('Invalid email address');
            expect(composable.formErrors.value.password).toContain(
                'Password must be at least 8 characters'
            );
        });

        it('clears previous errors after a successful validation', () => {
            // First: invalid
            composable.validate();
            expect(composable.isValid.value).toBe(false);

            // Fix the form
            composable.setForm({ email: 'valid@test.com', password: 'goodPassword' });
            composable.validate();
            expect(composable.formErrors.value).toEqual({});
        });
    });

    // ─── validate (without schema) ───────────────────────────────────────────

    describe('validate (without schema)', () => {
        it('always returns true when no schema is provided', () => {
            const noSchemaComposable = useStructureFormValidation<ILoginForm>(INITIAL_LOGIN);
            const ok = noSchemaComposable.validate();
            expect(ok).toBe(true);
            expect(noSchemaComposable.formErrors.value).toEqual({});
        });
    });

    // ─── validate (reactive schema getter) ────────────────────────────────────

    describe('validate (reactive schema getter)', () => {
        it('re-resolves a getter schema on every validate() call, e.g. after a locale switch', () => {
            let currentMessage = 'Invalid email address (en)';
            const getterComposable = useStructureFormValidation<ILoginForm>(INITIAL_LOGIN, () =>
                z.object({ email: z.string().email(currentMessage), password: z.string() })
            );

            getterComposable.validate();
            expect(getterComposable.formErrors.value.email).toContain('Invalid email address (en)');

            // Simulate a language change: the getter now returns fresh, differently-worded messages
            currentMessage = 'Indirizzo email non valido (it)';
            getterComposable.validate();
            expect(getterComposable.formErrors.value.email).toContain(
                'Indirizzo email non valido (it)'
            );
        });

        it('accepts a ref-wrapped schema the same way', () => {
            const schemaRef = ref(loginSchema);
            const refComposable = useStructureFormValidation<ILoginForm>(INITIAL_LOGIN, schemaRef);
            const ok = refComposable.validate();
            expect(ok).toBe(false);
            expect(refComposable.formErrors.value.email).toBeDefined();
        });

        it('resolves a schema whose messages are thunks just as late as a getter', () => {
            let currentMessage = 'Invalid email address (en)';
            const thunkComposable = useStructureFormValidation<ILoginForm>(
                INITIAL_LOGIN,
                // built ONCE, at setup — only the message is deferred
                z.object({
                    email: z.string().email({ error: () => currentMessage }),
                    password: z.string()
                })
            );

            thunkComposable.validate();
            expect(thunkComposable.formErrors.value.email).toContain('Invalid email address (en)');

            currentMessage = 'Indirizzo email non valido (it)';
            thunkComposable.validate();
            expect(thunkComposable.formErrors.value.email).toContain(
                'Indirizzo email non valido (it)'
            );
        });
    });

    // ─── revalidateOn ─────────────────────────────────────────────────────────

    /**
     * `formErrors` holds resolved strings, so nothing about the schema can re-translate an error
     * already on screen — only re-running `validate()` can. These cover the two halves of that:
     * it must re-run when there is something to re-translate, and must NOT run when there is not.
     */
    describe('revalidateOn', () => {
        it('re-translates displayed errors when the watched source changes', async () => {
            const locale = ref('en');
            const messages: Record<string, string> = {
                en: 'Invalid email address',
                it: 'Indirizzo email non valido'
            };
            const localeComposable = useStructureFormValidation<ILoginForm>(
                INITIAL_LOGIN,
                localizedSchema(() => messages[locale.value]!),
                { revalidateOn: locale }
            );

            localeComposable.validate();
            expect(localeComposable.formErrors.value.email).toContain('Invalid email address');

            locale.value = 'it';
            await nextTick();

            expect(localeComposable.formErrors.value.email).toContain('Indirizzo email non valido');
        });

        it('leaves a pristine form pristine', async () => {
            const locale = ref('en');
            const pristineComposable = useStructureFormValidation<ILoginForm>(
                INITIAL_LOGIN,
                loginSchema,
                { revalidateOn: locale }
            );

            locale.value = 'it';
            await nextTick();

            // never validated, so nothing is on display and nothing should appear
            expect(pristineComposable.formErrors.value).toEqual({});
            expect(pristineComposable.isValid.value).toBe(true);
        });

        it('does nothing to a form that validated cleanly', async () => {
            const locale = ref('en');
            const validComposable = useStructureFormValidation<ILoginForm>(
                INITIAL_LOGIN,
                loginSchema,
                { revalidateOn: locale }
            );

            validComposable.setForm({ email: 'valid@test.com', password: 'validPassword' });
            expect(validComposable.validate()).toBe(true);

            locale.value = 'it';
            await nextTick();

            expect(validComposable.formErrors.value).toEqual({});
        });

        it('accepts several sources', async () => {
            const locale = ref('en');
            const unitSystem = ref('metric');
            let revalidations = 0;
            const multiComposable = useStructureFormValidation<ILoginForm>(
                INITIAL_LOGIN,
                localizedSchema(() => {
                    revalidations += 1;
                    return 'Invalid email address';
                }),
                { revalidateOn: [locale, unitSystem] }
            );

            multiComposable.validate();
            const afterFirstValidate = revalidations;

            locale.value = 'it';
            await nextTick();
            unitSystem.value = 'imperial';
            await nextTick();

            expect(revalidations).toBe(afterFirstValidate + 2);
        });

        it('is inert when no source is given', async () => {
            const locale = ref('en');
            composable.validate();
            const before = { ...composable.formErrors.value };

            locale.value = 'it';
            await nextTick();

            expect(composable.formErrors.value).toEqual(before);
        });
    });

    // ─── handleSubmit ────────────────────────────────────────────────────────

    describe('handleSubmit', () => {
        it('does not call the handler when validation fails', async () => {
            const handler = jest.fn();
            const result = await composable.handleSubmit(handler);
            expect(result).toBe(false);
            expect(handler).not.toHaveBeenCalled();
        });

        it('calls the handler with form data when validation passes', async () => {
            composable.setForm({ email: 'valid@test.com', password: 'validPassword' });
            const handler = jest.fn().mockImplementation(async () => {});
            const result = await composable.handleSubmit(handler);
            expect(result).toBe(true);
            expect(handler).toHaveBeenCalledWith({
                email: 'valid@test.com',
                password: 'validPassword'
            });
        });

        it('sets isSubmitting to true during the handler and false afterwards', async () => {
            composable.setForm({ email: 'valid@test.com', password: 'validPassword' });
            let capturedSubmitting = false;
            const handler = jest.fn().mockImplementation(async () => {
                capturedSubmitting = composable.isSubmitting.value;
            });
            await composable.handleSubmit(handler);
            expect(capturedSubmitting).toBe(true);
            expect(composable.isSubmitting.value).toBe(false);
        });

        it('resets isSubmitting to false even if the handler throws', async () => {
            composable.setForm({ email: 'valid@test.com', password: 'validPassword' });
            const handler = jest.fn().mockRejectedValue(new Error('network error'));
            await expect(composable.handleSubmit(handler)).rejects.toThrow('network error');
            expect(composable.isSubmitting.value).toBe(false);
        });

        it('skips validation when withValidation is false', async () => {
            // form is intentionally invalid
            const handler = jest.fn().mockImplementation(async () => {});
            const result = await composable.handleSubmit(handler, false);
            expect(result).toBe(true);
            expect(handler).toHaveBeenCalled();
        });

        // ─── showFormErrors ownership ─────────────────────────────────────────
        // The composable, not the call site, decides when errors are on screen.

        it('reveals the errors when validation rejects the submit', async () => {
            await composable.handleSubmit(jest.fn());
            expect(composable.showFormErrors.value).toBe(true);
        });

        it('hides the errors once a submit validates', async () => {
            await composable.handleSubmit(jest.fn());
            composable.setForm({ email: 'valid@test.com', password: 'validPassword' });
            await composable.handleSubmit(jest.fn().mockImplementation(async () => {}));
            expect(composable.showFormErrors.value).toBe(false);
        });

        it('leaves the errors hidden when the handler itself fails', async () => {
            // A rejected API call says nothing about any particular field, so nothing to reveal.
            composable.setForm({ email: 'valid@test.com', password: 'validPassword' });
            const handler = jest.fn().mockRejectedValue(new Error('network error'));
            await expect(composable.handleSubmit(handler)).rejects.toThrow('network error');
            expect(composable.showFormErrors.value).toBe(false);
        });

        it('does not reveal anything when validation is skipped', async () => {
            await composable.handleSubmit(
                jest.fn().mockImplementation(async () => {}),
                false
            );
            expect(composable.showFormErrors.value).toBe(false);
        });
    });

    // ─── revealErrors ─────────────────────────────────────────────────────────

    describe('revealErrors', () => {
        it('turns showFormErrors on', async () => {
            await composable.revealErrors();
            expect(composable.showFormErrors.value).toBe(true);
        });

        it('focuses the first invalid field of the given form', async () => {
            const field = { focus: jest.fn() };
            const formElement = createForm(field);
            const withForm = useStructureFormValidation<ILoginForm>(INITIAL_LOGIN, loginSchema, {
                formElement
            });

            await withForm.revealErrors();

            expect(formElement.querySelector).toHaveBeenCalledWith('[aria-invalid="true"]');
            expect(field.focus).toHaveBeenCalled();
        });

        it('honours a custom selector, for kits that mark the wrapper', async () => {
            const formElement = createForm({ focus: jest.fn() });
            const withForm = useStructureFormValidation<ILoginForm>(INITIAL_LOGIN, loginSchema, {
                formElement,
                invalidFieldSelector: '.v-input--error input'
            });

            await withForm.revealErrors();

            expect(formElement.querySelector).toHaveBeenCalledWith('.v-input--error input');
        });

        it('reads the form element through a ref, so a template ref works', async () => {
            const field = { focus: jest.fn() };
            const formElement = ref<ReturnType<typeof createForm>>();
            const withForm = useStructureFormValidation<ILoginForm>(INITIAL_LOGIN, loginSchema, {
                formElement
            });

            // Unmounted: nothing to focus, and nothing to throw either.
            await withForm.revealErrors();
            expect(field.focus).not.toHaveBeenCalled();

            formElement.value = createForm(field);
            await withForm.revealErrors();
            expect(field.focus).toHaveBeenCalled();
        });

        it('is a pure state change when no form element was given', async () => {
            // The SSR / node-test path: no DOM is touched at all.
            await expect(composable.revealErrors()).resolves.toBeUndefined();
            expect(composable.showFormErrors.value).toBe(true);
        });

        it('tolerates a match that cannot be focused', async () => {
            const formElement = createForm({ notAFocusMethod: true });
            const withForm = useStructureFormValidation<ILoginForm>(INITIAL_LOGIN, loginSchema, {
                formElement
            });
            await expect(withForm.revealErrors()).resolves.toBeUndefined();
        });

        it('calls onInvalid with the errors on display', async () => {
            const onInvalid = jest.fn();
            const withHook = useStructureFormValidation<ILoginForm>(INITIAL_LOGIN, loginSchema, {
                onInvalid
            });

            withHook.validate();
            await withHook.revealErrors();

            expect(onInvalid).toHaveBeenCalledWith(
                expect.objectContaining({ email: ['Invalid email address'] })
            );
        });

        it('is reached by a failed handleSubmit, hook and focus included', async () => {
            const field = { focus: jest.fn() };
            const onInvalid = jest.fn();
            const withForm = useStructureFormValidation<ILoginForm>(INITIAL_LOGIN, loginSchema, {
                formElement: createForm(field),
                onInvalid
            });

            const result = await withForm.handleSubmit(jest.fn());

            expect(result).toBe(false);
            expect(field.focus).toHaveBeenCalled();
            expect(onInvalid).toHaveBeenCalled();
        });
    });

    // ─── applyServerErrors ────────────────────────────────────────────────────

    describe('applyServerErrors', () => {
        it('attaches a field map to the matching fields', () => {
            const applied = composable.applyServerErrors({
                errors: { email: 'Already taken', password: ['Too short', 'Too common'] }
            });

            expect(applied).toBe(true);
            expect(composable.formErrors.value.email).toEqual(['Already taken']);
            expect(composable.formErrors.value.password).toEqual(['Too short', 'Too common']);
        });

        it('reads a list of {field, message} objects', () => {
            composable.applyServerErrors({
                errors: [{ field: 'email', message: 'Already taken' }]
            });
            expect(composable.formErrors.value.email).toEqual(['Already taken']);
        });

        it('reads express-validator’s param/msg spelling', () => {
            composable.applyServerErrors({
                errors: [{ param: 'password', msg: 'Too short' }]
            });
            expect(composable.formErrors.value.password).toEqual(['Too short']);
        });

        it('reads a zod-shaped issue list, collapsing nested paths to their root field', () => {
            composable.applyServerErrors({
                issues: [{ path: ['email', 'domain'], message: 'Domain not allowed' }]
            });
            expect(composable.formErrors.value.email).toEqual(['Domain not allowed']);
        });

        it('digs the errors out of an unwrapped body', () => {
            composable.applyServerErrors({ data: { errors: { email: 'Already taken' } } });
            expect(composable.formErrors.value.email).toEqual(['Already taken']);
        });

        it('digs the errors out of a raw axios error', () => {
            composable.applyServerErrors({
                response: { data: { errors: { email: 'Already taken' } } }
            });
            expect(composable.formErrors.value.email).toEqual(['Already taken']);
        });

        it('renames server fields through the map option', () => {
            composable.applyServerErrors(
                { errors: { user_email: 'Already taken' } },
                { map: { user_email: 'email' } }
            );
            expect(composable.formErrors.value.email).toEqual(['Already taken']);
        });

        it('routes form-level messages to onUnmapped', () => {
            const onUnmapped = jest.fn();
            const applied = composable.applyServerErrors(
                { errors: ['Payment declined'] },
                { onUnmapped }
            );

            expect(applied).toBe(false);
            expect(onUnmapped).toHaveBeenCalledWith(['Payment declined']);
        });

        it('routes errors about fields this form does not have to onUnmapped', () => {
            const onUnmapped = jest.fn();
            composable.applyServerErrors({ errors: { captcha: 'Expired' } }, { onUnmapped });

            expect(onUnmapped).toHaveBeenCalledWith(['Expired']);
            expect(composable.formErrors.value).toEqual({});
        });

        it('splits a mixed payload between the fields and onUnmapped', () => {
            const onUnmapped = jest.fn();
            const applied = composable.applyServerErrors(
                { errors: [{ field: 'email', message: 'Already taken' }, 'Payment declined'] },
                { onUnmapped }
            );

            expect(applied).toBe(true);
            expect(composable.formErrors.value.email).toEqual(['Already taken']);
            expect(onUnmapped).toHaveBeenCalledWith(['Payment declined']);
        });

        it('reveals what it applied', () => {
            expect(composable.showFormErrors.value).toBe(false);
            composable.applyServerErrors({ errors: { email: 'Already taken' } });
            expect(composable.showFormErrors.value).toBe(true);
        });

        it('keeps errors the server said nothing about', () => {
            // The API answered about `email`; that is not an all-clear for `password`.
            composable.setFieldError('password', 'Too short');
            composable.applyServerErrors({ errors: { email: 'Already taken' } });

            expect(composable.formErrors.value.password).toEqual(['Too short']);
            expect(composable.formErrors.value.email).toEqual(['Already taken']);
        });

        it('returns false, and changes nothing, for a rejection carrying no errors', () => {
            const applied = composable.applyServerErrors(new Error('network error'));

            expect(applied).toBe(false);
            expect(composable.formErrors.value).toEqual({});
            expect(composable.showFormErrors.value).toBe(false);
        });

        it('ignores empty and non-string messages', () => {
            const applied = composable.applyServerErrors({
                errors: { email: ['', undefined, 42], password: [] }
            });

            expect(applied).toBe(false);
            expect(composable.formErrors.value).toEqual({});
        });
    });
});
