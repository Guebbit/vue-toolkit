/**
 * Toast and persistent messages in one Pinia setup store.
 *
 * - `history` keeps every message ever added; `messages` is the visible subset and
 *   `persistentMessages` the ones flagged to outlive their toast.
 * - Three verbs: `hideMessage` leaves the toast stack, `dismissMessage` is the user deleting
 *   (it tells the message's owner through `onDismiss`), `removeMessage` is the app dropping it
 *   silently.
 * - `onDismiss` callbacks live in a plain Map outside the reactive state, so `history` stays
 *   serializable.
 * - An optional timeout auto-hides a message after it is added.
 *
 * @module stores/notifications
 * @see docs/stores/notifications.md
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getUuid } from '@guebbit/js-toolkit';

/**
 * Visual variant of a toast; the value is what the UI layer maps to its own styling.
 */
export enum EToastType {
    PRIMARY = 'primary',
    SECONDARY = 'secondary',
    DANGER = 'error',
    WARNING = 'warning',
    SUCCESS = 'success'
}

/**
 * One toast, as stored in `history`.
 */
export interface IToastMessage {
    /** Unique id, generated on add unless the caller owns one; every other action looks the message up by it. */
    id: string;
    /** Text to display, already translated by the caller. */
    message: string;
    /** Visual variant. */
    type: EToastType;
    /** Whether it is currently shown; hidden messages stay in `history`. */
    visible: boolean;
    /** Listed by `persistentMessages` whether or not it is `visible`. */
    persistent: boolean;
    /** Epoch ms of creation; orders `persistentMessages`. */
    createdAt: number;
    /** Free payload for the renderer (link, code, icon…); the store never reads it. */
    meta?: Record<string, unknown>;
}

/**
 * Optional extras of `addMessage`, for messages that outlive a toast or belong to someone else.
 */
export interface IAddMessageOptions {
    /** Caller-owned id. An id already in `history` UPDATES that entry instead of adding one. */
    id?: string;
    /** Listed by `persistentMessages` regardless of `visible`. Default false. */
    persistent?: boolean;
    /** Epoch ms. Default `Date.now()`. A server message passes its own. */
    createdAt?: number;
    /** Free payload for the renderer (link, code, icon…). The store never reads it. */
    meta?: Record<string, unknown>;
    /** Called by `dismissMessage` only. Kept outside reactive state. */
    onDismiss?: () => void | Promise<void>;
}

/**
 * Toast notifications: add, show/hide, dismiss, remove.
 *
 * Pinia: `'notifications'` is the store id (devtools label, SSR state key); the function is a
 * setup store.
 *
 * @returns `history`, `messages`, `persistentMessages` and the message actions
 */
export const useNotificationsStore = defineStore('notifications', () => {
    // ________________ MESSAGES (also known as toasts) ________________

    /**
     * Every message ever added, hidden ones included, in insertion order.
     */
    const history = ref([] as IToastMessage[]);

    /**
     * Messages currently shown.
     */
    const messages = computed(() => history.value.filter(({ visible }) => visible));

    /**
     * Persistent messages, newest first; a panel or badge reads it.
     */
    const persistentMessages = computed(() =>
        history.value
            .filter(({ persistent }) => persistent)
            .toSorted((a, b) => b.createdAt - a.createdAt)
    );

    /**
     * `onDismiss` callbacks by message id. A plain Map, not state: functions are not serializable
     * and devtools / SSR hydration must keep working.
     */
    const dismissCallbacks = new Map<string, () => void | Promise<void>>();

    /**
     * Keeps the callback registry in step with a message: set it, or clear it when there is none.
     *
     * @param id        - id of the message the callback belongs to
     * @param onDismiss - the callback, if any
     */
    const registerDismiss = (id: string, onDismiss?: () => void | Promise<void>) => {
        // Stryker disable next-line ConditionalExpression: storing `undefined` reads back the same as no entry.
        if (onDismiss) dismissCallbacks.set(id, onDismiss);
        else dismissCallbacks.delete(id);
    };

    /**
     * Update-in-place for a re-added id: replaces the content, keeps `visible` (a refetch must not
     * bring back a toast the user closed) and keeps `createdAt`.
     *
     * @param existing - the stored message
     * @param message  - new text
     * @param type     - new variant
     * @param options  - new extras
     */
    const updateMessage = (
        existing: IToastMessage,
        message: string,
        type: EToastType,
        { persistent = false, meta, onDismiss }: IAddMessageOptions
    ) => {
        Object.assign(existing, { message, type, persistent, meta });
        registerDismiss(existing.id, onDismiss);
    };

    /**
     * Adds a visible message and, with a positive timeout, hides it once the timeout elapses.
     * A caller-owned `options.id` already in `history` updates that entry instead (no new entry,
     * `visible` kept, timeout not re-armed).
     *
     * @param message - text to display
     * @param type    - visual variant, default PRIMARY
     * @param timeout - milliseconds before auto-hiding; 0 or negative (default -1) = stays shown
     * @param options - persistence, caller-owned id, timestamp, payload and `onDismiss`
     * @returns the message's id, for a later `hideMessage`/`showMessage`/`dismissMessage`/`removeMessage`
     */
    const addMessage = (
        message: string,
        type = EToastType.PRIMARY,
        timeout = -1,
        options: IAddMessageOptions = {}
    ): string => {
        const { id = getUuid(), persistent = false, createdAt = Date.now(), meta } = options;
        // a freshly minted uuid never matches, so only a caller-owned id can hit an entry
        const known = findMessage(id);
        if (known) {
            updateMessage(known, message, type, options);
            return id;
        }
        history.value.push({ id, message, type, visible: true, persistent, createdAt, meta });
        registerDismiss(id, options.onDismiss);
        if (timeout > 0)
            setTimeout(() => {
                hideMessage(id);
            }, timeout);
        return id;
    };

    /**
     * Finds a message by id.
     *
     * @param _id - id of the message to find
     * @returns the stored message, or undefined when there is none
     */
    const findMessage = (_id: string) => history.value.find(({ id }) => id === _id);

    /**
     * Shared body of hideMessage / showMessage: sets one message's visibility.
     * Unknown ids are ignored.
     *
     * @param _id     - id of the message to change
     * @param visible - the visibility to set
     */
    const setVisibility = (_id: string, visible: boolean) => {
        const message = findMessage(_id);
        if (message) message.visible = visible;
    };

    /**
     * Hides a message; it stays in `history`.
     *
     * @param _id - id of the message to hide
     */
    const hideMessage = (_id: string) => setVisibility(_id, false);

    /**
     * Shows a hidden message again.
     *
     * @param _id - id of the message to show
     */
    const showMessage = (_id: string) => setVisibility(_id, true);

    /**
     * The app drops a message, from `history` too. Silent: `onDismiss` is not called, so a sync
     * that found the message gone at its source does not echo a delete back to it.
     *
     * @param _id - id of the message to remove
     * @returns the new history
     */
    const removeMessage = (_id: string) => {
        // Stryker disable next-line CallExpression: only frees memory; a removed id is never read again.
        dismissCallbacks.delete(_id);
        return (history.value = history.value.filter(({ id }) => id !== _id));
    };

    /**
     * Puts a message back at the index it left, unless the id was re-added in the meantime.
     *
     * @param entry    - the message that was taken out
     * @param index    - where it was
     * @param callback - its `onDismiss`, if it had one
     */
    const restoreMessage = (
        entry: IToastMessage,
        index: number,
        callback?: () => void | Promise<void>
    ) => {
        if (findMessage(entry.id)) return;
        history.value.splice(Math.min(index, history.value.length), 0, entry);
        registerDismiss(entry.id, callback);
    };

    /**
     * The user is done with a message: removes it optimistically, then calls its `onDismiss`.
     * If that rejects, the message goes back to its original index and the error is re-thrown for
     * the caller to show. An unknown id resolves as a no-op.
     *
     * @param _id - id of the message to dismiss
     * @returns resolves once `onDismiss` (if any) has
     * @throws whatever `onDismiss` rejected or threw with, after the rollback
     */
    const dismissMessage = (_id: string): Promise<void> => {
        const index = history.value.findIndex(({ id }) => id === _id);
        // Stryker disable next-line ConditionalExpression: without the guard an unknown id finds no entry, no callback, and resolves the same way.
        if (index === -1) return Promise.resolve();
        const entry = history.value[index]!;
        const callback = dismissCallbacks.get(_id);
        removeMessage(_id);
        // Promise.resolve().then also turns a synchronous throw into a rejection
        return Promise.resolve()
            .then(() => callback?.())
            .catch((error: unknown) => {
                restoreMessage(entry, index, callback);
                throw error;
            });
    };

    return {
        history,
        messages,
        persistentMessages,
        addMessage,
        findMessage,
        hideMessage,
        showMessage,
        dismissMessage,
        removeMessage
    };
});
