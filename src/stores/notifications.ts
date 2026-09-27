/**
 * Toast messages in one Pinia setup store.
 *
 * - `history` keeps every message ever added; `messages` is the visible subset.
 * - Hiding flips a flag and keeps the entry; `removeMessage` is the only real delete.
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
    /** Unique id, generated on add; every other action looks the message up by it. */
    id: string;
    /** Text to display, already translated by the caller. */
    message: string;
    /** Visual variant. */
    type: EToastType;
    /** Whether it is currently shown; hidden messages stay in `history`. */
    visible: boolean;
}

/**
 * Toast notifications: add, show/hide, remove.
 *
 * Pinia: `'notifications'` is the store id (devtools label, SSR state key); the function is a
 * setup store.
 *
 * @returns `history`, `messages` and the message actions
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
     * Adds a visible message and, with a positive timeout, hides it once the timeout elapses.
     *
     * @param message - text to display
     * @param type    - visual variant, default PRIMARY
     * @param timeout - milliseconds before auto-hiding; 0 or negative (default -1) = stays shown
     * @returns the new message's id, for a later `hideMessage`/`showMessage`/`removeMessage`
     */
    const addMessage = (message: string, type = EToastType.PRIMARY, timeout = -1): string => {
        const id = getUuid();
        history.value.push({
            id,
            message,
            type,
            visible: true
        });
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
     * Permanently removes a message, from `history` too.
     *
     * @param _id - id of the message to remove
     * @returns the new history
     */
    const removeMessage = (_id: string) =>
        (history.value = history.value.filter(({ id }) => id !== _id));

    return {
        history,
        messages,
        addMessage,
        findMessage,
        hideMessage,
        showMessage,
        removeMessage
    };
});
