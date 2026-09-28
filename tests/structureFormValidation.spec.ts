import { z } from 'zod';
import { effectScope, nextTick, readonly, ref, type EffectScope } from 'vue';
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

/** A form with a nested plain object, so a shallow copy is observable. */
interface IProfileForm {
    name: string;
    address: { city: string };
}

/** A form whose fields are not plain data: what a date picker or a multi-select binds to. */
interface IScheduleForm {
    tags: Set<string>;
    limits: Map<string, number>;
}

/** A fresh schedule: one tag, one limit. */
const schedule = (): IScheduleForm => ({
    tags: new Set(['a']),
    limits: new Map([['max', 1]])
});

/**
 * A handler the test finishes by hand, so two submits can overlap deliberately.
 */
const pendingHandler = () => {
    const { promise, resolve: finish } = Promise.withResolvers<void>();
    return { handler: () => promise, finish };
};

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
    /** The running test's scope: the watchers its composables start stop with it. */
    let scope: EffectScope;

    /**
     * Builds the composable (or starts a watcher on it) inside the running test's scope.
     *
     * @param build - what to run in the scope
     * @returns what `build` returns
     */
    const inScope = <R>(build: () => R): R => scope.run(build)!;

    /** A login-form composable, built in the running test's scope. */
    const make = (...parameters: Parameters<typeof useStructureFormValidation<ILoginForm>>) =>
        inScope(() => useStructureFormValidation<ILoginForm>(...parameters));

    let composable: ReturnType<typeof useStructureFormValidation<ILoginForm>>;

    beforeEach(() => {
        scope = effectScope();
        composable = make(INITIAL_LOGIN, loginSchema);
    });

    afterEach(() => scope.stop());

    // ─── form reactive ref ────────────────────────────────────────────────────

    describe('form (reactive ref)', () => {
        it('initialises with the provided initial data', () => {
            expect(composable.form.value).toEqual(INITIAL_LOGIN);
        });

        it('shares no nested object with the initial data, nor with its own baseline (deep copy)', () => {
            const source: IProfileForm = { name: 'Ada', address: { city: 'London' } };
            const c = inScope(() => useStructureFormValidation<IProfileForm>(source));

            c.form.value.address.city = 'Paris'; // edits the live form's nested object
            source.address.city = 'Berlin'; // and, independently, the caller's

            expect(c.form.value.address.city).toBe('Paris');
            // the baseline saw neither edit
            c.resetForm();
            expect(c.form.value.address.city).toBe('London');
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

    // ─── nested-field detachment (V3.3, repro F) ─────────────────────────────

    describe('nested fields are never shared with the source (detached copy)', () => {
        it('setInitialData detaches: editing the source afterwards does not change the baseline', () => {
            const source: IProfileForm = { name: 'Ada', address: { city: 'London' } };
            const c = inScope(() => useStructureFormValidation<IProfileForm>(source));

            c.setInitialData(source);
            source.address.city = 'Paris'; // mutated AFTER handing it over
            c.resetForm();

            expect(c.form.value.address.city).toBe('London');
        });

        it('resetForm shares no nested object with the baseline', () => {
            const c = inScope(() =>
                useStructureFormValidation<IProfileForm>({
                    name: 'Ada',
                    address: { city: 'London' }
                })
            );

            c.resetForm();
            c.form.value.address.city = 'Paris'; // mutate the live form's nested object

            expect(c.form.value.address.city).toBe('Paris');
            // the baseline's own copy must be untouched by that mutation
            c.resetForm();
            expect(c.form.value.address.city).toBe('London');
        });

        it('a hydrated readonly record does not leave nested fields read-only', () => {
            const hydrated = readonly({ name: 'Ada', address: { city: 'London' } });
            const c = inScope(() =>
                useStructureFormValidation<IProfileForm>({ name: '', address: { city: '' } })
            );

            c.setInitialData(hydrated as IProfileForm);
            c.resetForm();
            c.form.value.address.city = 'Paris'; // must actually apply, not be silently blocked

            expect(c.form.value.address.city).toBe('Paris');
        });

        it('setForm detaches the merged-in data too', () => {
            const patch = { address: { city: 'Paris' } };
            const c = inScope(() =>
                useStructureFormValidation<IProfileForm>({
                    name: 'Ada',
                    address: { city: 'London' }
                })
            );

            c.setForm(patch);
            patch.address.city = 'Berlin'; // mutated AFTER handing it over

            expect(c.form.value.address.city).toBe('Paris');
        });

        // Vue proxies a Set or Map inside `form` (a tag picker's `form.tags.add(tag)` is
        // reactive), so an in-place edit is a real UI path. A Date is not proxied, so no working
        // UI edits one in place: it is left out on purpose.
        it('detaches Set and Map fields too: an in-place edit leaves the source untouched', () => {
            const source = schedule();
            const c = inScope(() => useStructureFormValidation<IScheduleForm>(source));

            c.form.value.tags.add('b');
            c.form.value.limits.set('max', 2);

            expect([...source.tags]).toEqual(['a']);
            expect(source.limits.get('max')).toBe(1);
        });

        it('resetForm restores a Set or Map field edited in place', () => {
            const c = inScope(() => useStructureFormValidation<IScheduleForm>(schedule()));

            c.form.value.tags.add('b');
            c.form.value.limits.set('max', 2);
            c.resetForm();

            expect([...c.form.value.tags]).toEqual(['a']);
            expect(c.form.value.limits.get('max')).toBe(1);
        });
    });

    // ─── activateAutoHydrate ─────────────────────────────────────────────────

    describe('activateAutoHydrate', () => {
        it('does nothing while the source is undefined', () => {
            const source = ref<ILoginForm | undefined>(undefined);
            inScope(() => composable.activateAutoHydrate(source));
            expect(composable.form.value).toEqual(INITIAL_LOGIN);
            expect(composable.isDirty.value).toBe(false);
        });

        it('adopts the source as the new baseline as soon as it resolves', async () => {
            const source = ref<ILoginForm | undefined>(undefined);
            inScope(() => composable.activateAutoHydrate(source));

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
            inScope(() => composable.activateAutoHydrate(source));
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

        // JSON.stringify(new Set(['a'])) is "{}" for any Set, so a plain JSON comparison can never
        // see this edit — isDirty compares by stableKey instead (see A9).
        it('is true after an in-place edit of a Set field', () => {
            const c = inScope(() => useStructureFormValidation<IScheduleForm>(schedule()));
            c.form.value.tags.add('b');
            expect(c.isDirty.value).toBe(true);
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

        // V3.2: formLevelErrors counts too — a form-level-only failure must not read as valid.
        it('is false when only formLevelErrors is non-empty', () => {
            composable.applyServerErrors({ errors: ['Payment declined'] });
            expect(composable.formErrors.value).toEqual({});
            expect(composable.isValid.value).toBe(false);
        });

        it('clearErrors clears formLevelErrors too', () => {
            composable.applyServerErrors({ errors: ['Payment declined'] });
            composable.clearErrors();
            expect(composable.formLevelErrors.value).toEqual([]);
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

    // ─── validate (root-level Zod issues, V3.2) ──────────────────────────────

    describe('validate (root-level issues)', () => {
        // No `path` given, so Zod attaches this issue at the root (empty path) — a cross-field
        // rule with nowhere to be filed under a single input.
        const crossFieldSchema = z
            .object({ email: z.string(), password: z.string() })
            .refine((data) => data.email !== data.password, {
                message: 'Email and password must differ'
            });

        it('routes a root-level issue to formLevelErrors instead of dropping it', () => {
            const c = make({ email: 'same', password: 'same' }, crossFieldSchema);
            const ok = c.validate();

            expect(ok).toBe(false);
            expect(c.formLevelErrors.value).toEqual(['Email and password must differ']);
            expect(c.isValid.value).toBe(false); // formErrors alone would say true — that's the bug
        });

        it('clears formLevelErrors once the form becomes valid', () => {
            const c = make({ email: 'same', password: 'same' }, crossFieldSchema);
            c.validate();

            c.setForm({ email: 'a', password: 'b' });
            c.validate();

            expect(c.formLevelErrors.value).toEqual([]);
            expect(c.isValid.value).toBe(true);
        });
    });

    // ─── field names Object.prototype also answers for ──────────────────────
    // A plain object "has" `constructor` and `toString` through its prototype: an existence check
    // must look at own keys only, or those names are mistaken for fields already there.

    describe('field names Object.prototype also has', () => {
        it('validate files an issue under a field named constructor', () => {
            const c = inScope(() =>
                useStructureFormValidation<{ constructor: string }>(
                    { constructor: '' },
                    z.object({ constructor: z.string().min(1, 'Required') })
                )
            );

            expect(c.validate()).toBe(false);
            expect(c.formErrors.value.constructor).toEqual(['Required']);
        });

        it('applyServerErrors sends a toString message, a field the form lacks, to formLevelErrors', () => {
            composable.applyServerErrors({ errors: { toString: 'Rejected' } });

            expect(composable.formLevelErrors.value).toEqual(['Rejected']);
            expect(Object.hasOwn(composable.formErrors.value, 'toString')).toBe(false);
        });

        it('applyServerErrors attaches a message to a field named constructor', () => {
            const c = inScope(() =>
                useStructureFormValidation<{ constructor: string }>({ constructor: '' })
            );

            c.applyServerErrors({ errors: { constructor: 'Rejected' } });

            expect(c.formErrors.value.constructor).toEqual(['Rejected']);
            expect(c.formLevelErrors.value).toEqual([]);
        });
    });

    // ─── validate (without schema) ───────────────────────────────────────────

    describe('validate (without schema)', () => {
        it('always returns true when no schema is provided', () => {
            const noSchemaComposable = make(INITIAL_LOGIN);
            const ok = noSchemaComposable.validate();
            expect(ok).toBe(true);
            expect(noSchemaComposable.formErrors.value).toEqual({});
        });
    });

    // ─── validate (reactive schema getter) ────────────────────────────────────

    describe('validate (reactive schema getter)', () => {
        it('re-resolves a getter schema on every validate() call, e.g. after a locale switch', () => {
            let currentMessage = 'Invalid email address (en)';
            const getterComposable = make(INITIAL_LOGIN, () =>
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
            const refComposable = make(INITIAL_LOGIN, schemaRef);
            const ok = refComposable.validate();
            expect(ok).toBe(false);
            expect(refComposable.formErrors.value.email).toBeDefined();
        });

        it('resolves a schema whose messages are thunks just as late as a getter', () => {
            let currentMessage = 'Invalid email address (en)';
            const thunkComposable = make(
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
            const localeComposable = make(
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
            const pristineComposable = make(INITIAL_LOGIN, loginSchema, { revalidateOn: locale });

            locale.value = 'it';
            await nextTick();

            // never validated, so nothing is on display and nothing should appear
            expect(pristineComposable.formErrors.value).toEqual({});
            expect(pristineComposable.isValid.value).toBe(true);
        });

        it('does nothing to a form that validated cleanly', async () => {
            const locale = ref('en');
            const validComposable = make(INITIAL_LOGIN, loginSchema, { revalidateOn: locale });

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
            const multiComposable = make(
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

        it('keeps a setFieldError error across a revalidate, alongside a refreshed schema error', async () => {
            const locale = ref('en');
            const messages: Record<string, string> = {
                en: 'Invalid email address',
                it: 'Indirizzo email non valido'
            };
            const localeComposable = make(
                INITIAL_LOGIN,
                localizedSchema(() => messages[locale.value]!),
                { revalidateOn: locale }
            );

            localeComposable.validate();
            localeComposable.setFieldError('password', 'Already taken');
            expect(localeComposable.formErrors.value.password).toEqual(['Already taken']);

            locale.value = 'it';
            await nextTick();

            expect(localeComposable.formErrors.value.password).toEqual(['Already taken']);
            expect(localeComposable.formErrors.value.email).toContain('Indirizzo email non valido');
        });

        it('keeps an applyServerErrors field error across a revalidate', async () => {
            const locale = ref('en');
            const localeComposable = make(
                INITIAL_LOGIN,
                localizedSchema(() => 'x'),
                {
                    revalidateOn: locale
                }
            );
            localeComposable.setForm({ email: 'valid@test.com', password: 'validPassword' });
            localeComposable.validate();
            localeComposable.applyServerErrors({ errors: { email: 'Already registered' } });
            expect(localeComposable.formErrors.value.email).toEqual(['Already registered']);

            locale.value = 'it';
            await nextTick();

            expect(localeComposable.formErrors.value.email).toEqual(['Already registered']);
        });

        it('keeps an applyServerErrors unmapped form-level error across a revalidate', async () => {
            const locale = ref('en');
            const localeComposable = make(
                INITIAL_LOGIN,
                localizedSchema(() => 'x'),
                {
                    revalidateOn: locale
                }
            );
            localeComposable.validate();
            localeComposable.applyServerErrors({ errors: { unknownField: 'Rejected' } });
            expect(localeComposable.formLevelErrors.value).toContain('Rejected');

            locale.value = 'it';
            await nextTick();

            expect(localeComposable.formLevelErrors.value).toContain('Rejected');
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

        // ─── one submit at a time ─────────────────────────────────────────────
        // A second submit while one runs (a double click, Enter plus a click) would repeat the
        // handler's side effects — a duplicate POST — so it resolves false without running.

        it('resolves false without calling its handler while another submit runs', async () => {
            composable.setForm({ email: 'valid@test.com', password: 'validPassword' });
            const first = pendingHandler();
            const second = jest.fn();

            const firstSubmit = composable.handleSubmit(first.handler);
            const secondResult = await composable.handleSubmit(second);

            expect(secondResult).toBe(false);
            expect(second).not.toHaveBeenCalled();
            // the first is still running, and alone decides when submitting ends
            expect(composable.isSubmitting.value).toBe(true);

            first.finish();
            await expect(firstSubmit).resolves.toBe(true);
            expect(composable.isSubmitting.value).toBe(false);
        });

        it('a skipped submit neither validates nor reveals errors', async () => {
            composable.setForm({ email: 'valid@test.com', password: 'validPassword' });
            const first = pendingHandler();
            const firstSubmit = composable.handleSubmit(first.handler);
            // invalid now: a submit that did validate would reveal errors
            composable.setForm({ email: 'not-an-email', password: '' });

            await composable.handleSubmit(jest.fn());

            expect(composable.showFormErrors.value).toBe(false);
            expect(composable.formErrors.value).toEqual({});
            first.finish();
            await firstSubmit;
        });

        it('takes the next submit once the running one has resolved', async () => {
            composable.setForm({ email: 'valid@test.com', password: 'validPassword' });
            const first = pendingHandler();
            const firstSubmit = composable.handleSubmit(first.handler);
            first.finish();
            await firstSubmit;

            const next = jest.fn();
            await expect(composable.handleSubmit(next)).resolves.toBe(true);
            expect(next).toHaveBeenCalledTimes(1);
        });

        it('takes the next submit once the running one has rejected', async () => {
            composable.setForm({ email: 'valid@test.com', password: 'validPassword' });
            await expect(
                composable.handleSubmit(jest.fn().mockRejectedValue(new Error('network error')))
            ).rejects.toThrow('network error');

            const next = jest.fn();
            await expect(composable.handleSubmit(next)).resolves.toBe(true);
            expect(next).toHaveBeenCalledTimes(1);
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
            const withForm = make(INITIAL_LOGIN, loginSchema, {
                formElement
            });

            await withForm.revealErrors();

            expect(formElement.querySelector).toHaveBeenCalledWith('[aria-invalid="true"]');
            expect(field.focus).toHaveBeenCalled();
        });

        it('honours a custom selector, for kits that mark the wrapper', async () => {
            const formElement = createForm({ focus: jest.fn() });
            const withForm = make(INITIAL_LOGIN, loginSchema, {
                formElement,
                invalidFieldSelector: '.v-input--error input'
            });

            await withForm.revealErrors();

            expect(formElement.querySelector).toHaveBeenCalledWith('.v-input--error input');
        });

        it('reads the form element through a ref, so a template ref works', async () => {
            const field = { focus: jest.fn() };
            const formElement = ref<ReturnType<typeof createForm>>();
            const withForm = make(INITIAL_LOGIN, loginSchema, {
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
            const withForm = make(INITIAL_LOGIN, loginSchema, {
                formElement
            });
            await expect(withForm.revealErrors()).resolves.toBeUndefined();
        });

        it('calls onInvalid with the errors on display', async () => {
            const onInvalid = jest.fn();
            const withHook = make(INITIAL_LOGIN, loginSchema, {
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
            const withForm = make(INITIAL_LOGIN, loginSchema, {
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
            composable.applyServerErrors({ errors: ['Payment declined'] }, { onUnmapped });

            expect(onUnmapped).toHaveBeenCalledWith(['Payment declined']);
        });

        it('returns true once onUnmapped has taken the messages, so the caller owes no second one', () => {
            const addMessage = jest.fn();

            // The documented call site: `false` means the caller still owes the user a message.
            if (
                !composable.applyServerErrors(
                    { errors: ['Payment declined'] },
                    { onUnmapped: (messages) => addMessage(messages[0]) }
                )
            )
                addMessage('Unexpected error');

            expect(addMessage.mock.calls).toEqual([['Payment declined']]);
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

        // V3.2: without onUnmapped, a form-level message is displayed instead of dropped.
        it('routes form-level messages to formLevelErrors when no onUnmapped is given', () => {
            const applied = composable.applyServerErrors({ errors: ['Payment declined'] });

            expect(applied).toBe(true);
            expect(composable.formLevelErrors.value).toEqual(['Payment declined']);
            expect(composable.isValid.value).toBe(false);
        });

        it('routes errors about fields this form does not have to formLevelErrors too', () => {
            const applied = composable.applyServerErrors({ errors: { captcha: 'Expired' } });

            expect(applied).toBe(true);
            expect(composable.formLevelErrors.value).toEqual(['Expired']);
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
