/**
 * TYPES — useStructureFormValidation: `T` is inferred from `initialData`, and the zod schema must
 * conform to it.
 */
import { z } from 'zod';
import { expectTypeOf } from 'expect-type';
import { useStructureFormValidation } from '../../src/index.js';

const schema = z.object({ name: z.string(), age: z.number() });

const form = useStructureFormValidation({ name: '', age: 0 }, schema);

expectTypeOf(form.form.value).toEqualTypeOf<{ name: string; age: number }>();
expectTypeOf(form.formErrors.value).toEqualTypeOf<
    Partial<Record<'name' | 'age', string[]>>
>();

// @ts-expect-error -- the schema's shape must match initialData's inferred T
useStructureFormValidation({ name: '', age: 0 }, z.object({ name: z.number() }));
