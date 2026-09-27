/**
 * TYPES — useIsLoading: a plain `ComputedRef<boolean>`, no key-tracking type surface to infer.
 */
import type { QueryClient } from '@tanstack/vue-query';
import { expectTypeOf } from 'expect-type';
import { useIsLoading } from '../../src/index.js';

expectTypeOf(useIsLoading()).toEqualTypeOf<import('vue').ComputedRef<boolean>>();
expectTypeOf(useIsLoading(['account'])).toEqualTypeOf<import('vue').ComputedRef<boolean>>();
expectTypeOf(useIsLoading).parameter(1).toEqualTypeOf<QueryClient | undefined>();

// @ts-expect-error -- prefixes is an array of strings, not a bare string
useIsLoading('account');
