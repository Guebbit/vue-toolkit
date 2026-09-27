/**
 * TYPES — useCoreStore / useNotificationsStore: the return shape of each Pinia setup store, plus
 * EToastType and DEFAULT_INVALID_FIELD_SELECTOR.
 */
import { expectTypeOf } from 'expect-type';
import {
    DEFAULT_INVALID_FIELD_SELECTOR,
    EToastType,
    useCoreStore,
    useNotificationsStore,
    type IToastMessage
} from '../../src/index.js';

expectTypeOf(DEFAULT_INVALID_FIELD_SELECTOR).toEqualTypeOf<string>();
expectTypeOf(EToastType.PRIMARY).toEqualTypeOf<EToastType>();

// Pinia auto-unwraps a setup store's refs at the type level too: accessed off the store instance,
// `loadings` is the plain value, not a `Ref` — `storeToRefs` is what gets a `Ref` back.
const core = useCoreStore();
expectTypeOf(core.loadings).toEqualTypeOf<Record<string, boolean>>();
expectTypeOf(core.isLoading).parameter(0).toEqualTypeOf<string[] | undefined>();
expectTypeOf(core.isLoading).returns.toEqualTypeOf<boolean>();

const notifications = useNotificationsStore();
expectTypeOf(notifications.history).toEqualTypeOf<IToastMessage[]>();
expectTypeOf(notifications.messages).toEqualTypeOf<IToastMessage[]>();

// @ts-expect-error -- isLoading takes key prefixes, not a plain boolean
core.isLoading(true);
