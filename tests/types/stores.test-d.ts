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
// addMessage returns the new message's id, for a later hideMessage/showMessage/removeMessage.
expectTypeOf(notifications.addMessage('hi')).toEqualTypeOf<string>();

// @ts-expect-error -- isLoading takes key prefixes, not a plain boolean
core.isLoading(true);

// setLoading/getLoading both require their key; setLoading also requires its value, so
// setLoading('x') cannot quietly store false.
core.setLoading('fetch', true);
core.getLoading('fetch');
// @ts-expect-error -- key is required
core.setLoading(undefined, true);
// @ts-expect-error -- value is required
core.setLoading('fetch');
// @ts-expect-error -- key is required
core.getLoading();
