import { computed, ref } from '../utils/reactivity';
import { defineStore } from '../utils/store';

export enum IToastType {
    PRIMARY = 'primary',
    SECONDARY = 'secondary',
    DANGER = 'error',
    WARNING = 'warning',
    SUCCESS = 'success'
}
export interface IToastMessage {
    id: string;
    message: string;
    type: IToastType;
    visible: boolean;
}

/**
 *
 */
export const useNotificationsStore = defineStore('notifications', () => {
    // ________________ MESSAGES (also known as toasts) ________________

    /**
     * Settings
     */
    const history = ref([] as IToastMessage[]);

    /**
     * Visible messages
     */
    const messages = computed(() => history.value.filter(({ visible }) => visible));

    /**
     * Add a message then after a timeout and then remove it (FIFO)
     *
     * @param message
     * @param type
     * @param timeout
     */
    const addMessage = (message: string, type = IToastType.PRIMARY, timeout = -1) => {
        const id = crypto.randomUUID();
        // Add to history
        history.value.push({
            id,
            message,
            type,
            visible: true
        });
        // Remove after timeout (if any)
        if (timeout > 0)
            setTimeout(() => {
                hideMessage(id);
            }, timeout);
    };

    /**
     * Find a message by id
     *
     * @param _id
     */
    const findMessage = (_id: string) => history.value.find(({ id }) => id === _id);

    /**
     * Hide a message visiblity
     *
     * @param _id
     */
    const hideMessage = (_id: string) => {
        const message = findMessage(_id);
        if (message) message.visible = false;
    };

    /**
     * Show a message visiblity
     *
     * @param _id
     */
    const showMessage = (_id: string) => {
        const message = findMessage(_id);
        if (message) message.visible = true;
    };

    /**
     * Permanently remove a message (even from history)
     *
     * @param _id
     */
    const removeMessage = (_id: string) =>
        (history.value = history.value.filter(({ id }) => id !== _id));

    // ________________ DIALOGS ________________

    /**
     * Manage all dialogs
     * key is dialog name, value is dialog visibility (on/off)
     */
    const dialogs = ref({} as Record<string, boolean>);

    return {
        history,
        messages,
        addMessage,
        findMessage,
        hideMessage,
        showMessage,
        removeMessage,
        dialogs
    };
});
