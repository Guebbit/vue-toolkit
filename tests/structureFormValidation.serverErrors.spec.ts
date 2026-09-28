/**
 * Pins down how a rejected payload is normalized into field errors, form-level messages and the
 * boolean result of `applyServerErrors`. The normalizer is internal, so every row goes through
 * the public entry point and reads the outcome off the form.
 */
/* eslint-disable unicorn/no-null -- junk payloads (null included) are the subject */
import { effectScope, type EffectScope } from 'vue';
import { useStructureFormValidation } from '../src/composables/structureFormValidation';

interface IContactForm {
    email: string;
    other: string;
}

const INITIAL_CONTACT: IContactForm = { email: '', other: '' };

/** A list-shaped rejection with one entry. */
const listOf = (entry: unknown) => ({ errors: [entry] });

describe('useStructureFormValidation server-error normalization', () => {
    /** The running test's scope: the watchers the composable starts stop with it. */
    let scope: EffectScope;

    beforeEach(() => {
        scope = effectScope();
    });

    afterEach(() => scope.stop());

    /**
     * Applies a rejection to a fresh contact form and reports what landed where.
     *
     * @param error   - the rejected value
     * @param options - forwarded to applyServerErrors
     * @returns the boolean result plus the field and form-level errors
     */
    const apply = (
        error: unknown,
        options?: Parameters<
            ReturnType<typeof useStructureFormValidation<IContactForm>>['applyServerErrors']
        >[1]
    ) => {
        const c = scope.run(() => useStructureFormValidation<IContactForm>(INITIAL_CONTACT))!;
        const result = c.applyServerErrors(error, options);
        return { result, fields: c.formErrors.value, level: c.formLevelErrors.value };
    };

    describe('field probe order (3.1-3.3)', () => {
        it.each([
            ['field', { field: 'email', message: 'Bad' }],
            ['name', { name: 'email', message: 'Bad' }],
            ['param', { param: 'email', message: 'Bad' }]
        ])('resolves the field from `%s`', (_key, entry) => {
            expect(apply(listOf(entry))).toEqual({
                result: true,
                fields: { email: ['Bad'] },
                level: []
            });
        });

        it('probes field, then name, then param', () => {
            expect(
                apply(listOf({ field: 'email', name: 'other', param: 'other', message: 'M' }))
                    .fields
            ).toEqual({ email: ['M'] });
            expect(apply(listOf({ name: 'email', param: 'other', message: 'M' })).fields).toEqual({
                email: ['M']
            });
        });

        it('falls through an empty `field` to `name`', () => {
            expect(apply(listOf({ field: '', name: 'email', message: 'M' })).fields).toEqual({
                email: ['M']
            });
        });

        it('falls through a non-string `field` to `name`', () => {
            expect(apply(listOf({ field: 42, name: 'email', message: 'M' })).fields).toEqual({
                email: ['M']
            });
        });

        it('treats an entry with no usable key as form-level', () => {
            expect(apply(listOf({ field: '', name: 7, message: 'M' }))).toEqual({
                result: true,
                fields: {},
                level: ['M']
            });
        });
    });

    describe('path (3.4-3.7)', () => {
        it('reads a string path as the field', () => {
            expect(apply(listOf({ path: 'email', message: 'M' })).fields).toEqual({
                email: ['M']
            });
        });

        it('ignores an empty string path', () => {
            expect(apply(listOf({ path: '', message: 'M' }))).toMatchObject({
                fields: {},
                level: ['M']
            });
        });

        it('reads the first segment of an array path', () => {
            expect(apply(listOf({ path: ['email', 0], message: 'M' })).fields).toEqual({
                email: ['M']
            });
        });

        it.each([[['']], [[7]], [[]]])('yields no field for the array path %j', (path) => {
            expect(apply(listOf({ path, message: 'M' }))).toMatchObject({
                fields: {},
                level: ['M']
            });
        });

        it('yields no field for a non-array object path', () => {
            expect(apply(listOf({ path: {}, message: 'M' }))).toMatchObject({
                fields: {},
                level: ['M']
            });
        });
    });

    describe('messages (3.8-3.9)', () => {
        it('drops an empty message rather than keeping [""]', () => {
            expect(apply(listOf({ field: 'email', message: '' }))).toEqual({
                result: false,
                fields: {},
                level: []
            });
        });

        it.each([[42], [null], [{}]])('drops the non-string message %j', (message) => {
            expect(apply(listOf({ field: 'email', message }))).toEqual({
                result: false,
                fields: {},
                level: []
            });
        });

        it('reads `msg` when `message` is absent', () => {
            expect(apply(listOf({ field: 'email', msg: 'M' })).fields).toEqual({ email: ['M'] });
        });

        it('keeps only the non-empty strings of a message list', () => {
            expect(apply(listOf({ field: 'email', message: ['A', '', 3, 'B'] })).fields).toEqual({
                email: ['A', 'B']
            });
        });

        it('drops a list with no usable message from a field map', () => {
            expect(apply({ errors: { email: [''], other: 5 } })).toEqual({
                result: false,
                fields: {},
                level: []
            });
        });
    });

    describe('collection shapes (3.10-3.12)', () => {
        it('turns a string entry into a form-level message', () => {
            expect(apply({ errors: ['Boom'] })).toEqual({
                result: true,
                fields: {},
                level: ['Boom']
            });
        });

        it('ignores entries that are neither a string nor a record', () => {
            expect(apply({ errors: [42, null, undefined] })).toEqual({
                result: false,
                fields: {},
                level: []
            });
        });

        it('keeps the good entries next to a junk one', () => {
            expect(apply({ errors: [42, { field: 'email', message: 'M' }] })).toEqual({
                result: true,
                fields: { email: ['M'] },
                level: []
            });
        });

        it.each([[undefined], [null], ['text'], [42], [{}]])(
            'shows nothing for the rejection %j',
            (error) => {
                expect(apply(error)).toEqual({ result: false, fields: {}, level: [] });
            }
        );

        it.each([['text'], [42], [null]])('shows nothing for the errors value %j', (errors) => {
            expect(apply({ errors })).toEqual({ result: false, fields: {}, level: [] });
        });

        it('returns false for an empty list and an empty map', () => {
            expect(apply({ errors: [] }).result).toBe(false);
            expect(apply({ errors: {} }).result).toBe(false);
        });
    });

    describe('onUnmapped (7.5)', () => {
        it('is not called with an empty list', () => {
            const onUnmapped = jest.fn();

            expect(apply(listOf({ field: 'email', message: 'M' }), { onUnmapped }).result).toBe(
                true
            );
            expect(onUnmapped).not.toHaveBeenCalled();
        });

        it('is called once with the unmapped messages', () => {
            const onUnmapped = jest.fn();

            apply({ errors: ['A', { field: 'nope', message: 'B' }] }, { onUnmapped });

            expect(onUnmapped).toHaveBeenCalledTimes(1);
            expect(onUnmapped).toHaveBeenCalledWith(['A', 'B']);
        });

        it('leaves formErrors untouched when nothing applied', () => {
            const c = scope.run(() => useStructureFormValidation<IContactForm>(INITIAL_CONTACT))!;
            c.setFieldError('other', 'Existing');
            const before = c.formErrors.value;

            c.applyServerErrors({ errors: ['Only form-level'] }, { onUnmapped: jest.fn() });

            expect(c.formErrors.value).toBe(before);
            expect(c.formLevelErrors.value).toEqual([]);
        });
    });
});
