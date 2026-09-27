/**
 * TYPES — useLivenessProbe: the `down`/`check`/`stop` shape, independent of what the probe checks.
 */
import { expectTypeOf } from 'expect-type';
import { useLivenessProbe } from '../../src/index.js';

const probe = useLivenessProbe(() => Promise.resolve('anything, ignored'));

expectTypeOf(probe.down.value).toEqualTypeOf<boolean>();
expectTypeOf(probe.check).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(probe.stop).toEqualTypeOf<() => void>();

// @ts-expect-error -- the probe must be a zero-argument, promise-returning function
useLivenessProbe(() => 'not a promise');
