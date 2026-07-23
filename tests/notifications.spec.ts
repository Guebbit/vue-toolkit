import { createPinia, setActivePinia } from 'pinia';
import { useNotificationsStore, IToastType } from '../src/stores/notifications';

describe('useNotificationsStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('starts with empty history and messages', () => {
        const store = useNotificationsStore();
        expect(store.history).toHaveLength(0);
        expect(store.messages).toHaveLength(0);
    });

    it('adds a message to history', () => {
        const store = useNotificationsStore();
        store.addMessage('Hello', IToastType.SUCCESS);
        expect(store.history).toHaveLength(1);
        expect(store.history[0].message).toBe('Hello');
        expect(store.history[0].type).toBe(IToastType.SUCCESS);
        expect(store.history[0].visible).toBe(true);
    });

    it('shows visible messages in computed messages', () => {
        const store = useNotificationsStore();
        store.addMessage('Visible', IToastType.PRIMARY);
        expect(store.messages).toHaveLength(1);
    });

    it('hides a message by id', () => {
        const store = useNotificationsStore();
        store.addMessage('Hide me', IToastType.WARNING);
        const id = store.history[0].id;
        store.hideMessage(id);
        expect(store.messages).toHaveLength(0);
        expect(store.history[0].visible).toBe(false);
    });

    it('shows a hidden message by id', () => {
        const store = useNotificationsStore();
        store.addMessage('Toggle me', IToastType.DANGER);
        const id = store.history[0].id;
        store.hideMessage(id);
        store.showMessage(id);
        expect(store.messages).toHaveLength(1);
        expect(store.history[0].visible).toBe(true);
    });

    it('removes a message permanently from history', () => {
        const store = useNotificationsStore();
        store.addMessage('Remove me', IToastType.PRIMARY);
        const id = store.history[0].id;
        store.removeMessage(id);
        expect(store.history).toHaveLength(0);
    });

    it('finds a message by id', () => {
        const store = useNotificationsStore();
        store.addMessage('Find me', IToastType.SECONDARY);
        const id = store.history[0].id;
        const found = store.findMessage(id);
        expect(found?.message).toBe('Find me');
    });

    it('dialogs are empty by default', () => {
        const store = useNotificationsStore();
        expect(Object.keys(store.dialogs)).toHaveLength(0);
    });

    describe('auto-hide timeout', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        it('hides a message automatically after a positive timeout', () => {
            const store = useNotificationsStore();
            store.addMessage('Temporary', IToastType.PRIMARY, 1000);
            expect(store.messages).toHaveLength(1);

            jest.advanceTimersByTime(999);
            expect(store.messages).toHaveLength(1); // not yet

            jest.advanceTimersByTime(1);
            expect(store.messages).toHaveLength(0); // hidden at the deadline
            expect(store.history).toHaveLength(1); // but still in history
        });

        it('does NOT schedule any hide when timeout is <= 0 (the default)', () => {
            const store = useNotificationsStore();
            store.addMessage('Sticky', IToastType.PRIMARY); // default timeout -1
            store.addMessage('AlsoSticky', IToastType.PRIMARY, 0); // explicit 0

            jest.advanceTimersByTime(1_000_000);
            expect(store.messages).toHaveLength(2); // both remain visible forever
        });
    });
});
