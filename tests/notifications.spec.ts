import { createPinia, setActivePinia } from 'pinia';
import { useNotificationsStore, EToastType } from '../src/stores/notifications';

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
        store.addMessage('Hello', EToastType.SUCCESS);
        expect(store.history).toHaveLength(1);
        expect(store.history[0].message).toBe('Hello');
        expect(store.history[0].type).toBe(EToastType.SUCCESS);
        expect(store.history[0].visible).toBe(true);
    });

    // V2.12: the returned id is what lets a caller hide/show/remove the message it just added
    // without re-reading history to find it.
    it("returns the new message's id", () => {
        const store = useNotificationsStore();
        const id = store.addMessage('Hello');
        expect(id).toBe(store.history[0].id);

        store.hideMessage(id);
        expect(store.history[0].visible).toBe(false);
    });

    it('defaults to EToastType.PRIMARY when no type is given', () => {
        const store = useNotificationsStore();
        store.addMessage('Hello');
        expect(store.history[0].type).toBe(EToastType.PRIMARY);
    });

    it('shows visible messages in computed messages', () => {
        const store = useNotificationsStore();
        store.addMessage('Visible', EToastType.PRIMARY);
        expect(store.messages).toHaveLength(1);
    });

    it('hides a message by id', () => {
        const store = useNotificationsStore();
        store.addMessage('Hide me', EToastType.WARNING);
        const id = store.history[0].id;
        store.hideMessage(id);
        expect(store.messages).toHaveLength(0);
        expect(store.history[0].visible).toBe(false);
    });

    it('shows a hidden message by id', () => {
        const store = useNotificationsStore();
        store.addMessage('Toggle me', EToastType.DANGER);
        const id = store.history[0].id;
        store.hideMessage(id);
        store.showMessage(id);
        expect(store.messages).toHaveLength(1);
        expect(store.history[0].visible).toBe(true);
    });

    it('removes a message permanently from history', () => {
        const store = useNotificationsStore();
        store.addMessage('Remove me', EToastType.PRIMARY);
        const id = store.history[0].id;
        store.removeMessage(id);
        expect(store.history).toHaveLength(0);
    });

    it('finds a message by id', () => {
        const store = useNotificationsStore();
        store.addMessage('Find me', EToastType.SECONDARY);
        const id = store.history[0].id;
        const found = store.findMessage(id);
        expect(found?.message).toBe('Find me');
    });

    describe('auto-hide timeout', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        it('hides a message automatically after a positive timeout', () => {
            const store = useNotificationsStore();
            store.addMessage('Temporary', EToastType.PRIMARY, 1000);
            expect(store.messages).toHaveLength(1);

            jest.advanceTimersByTime(999);
            expect(store.messages).toHaveLength(1); // not yet

            jest.advanceTimersByTime(1);
            expect(store.messages).toHaveLength(0); // hidden at the deadline
            expect(store.history).toHaveLength(1); // but still in history
        });

        it('does NOT schedule any hide when timeout is <= 0 (the default)', () => {
            const store = useNotificationsStore();
            store.addMessage('Sticky', EToastType.PRIMARY); // default timeout -1
            store.addMessage('AlsoSticky', EToastType.PRIMARY, 0); // explicit 0

            jest.advanceTimersByTime(1_000_000);
            expect(store.messages).toHaveLength(2); // both remain visible forever
        });

        it('the timer firing after the message was already removed is a safe no-op', () => {
            const store = useNotificationsStore();
            const id = store.addMessage('Temporary', EToastType.PRIMARY, 1000);
            store.removeMessage(id);
            expect(store.history).toHaveLength(0);

            expect(() => jest.advanceTimersByTime(1000)).not.toThrow();
            expect(store.history).toHaveLength(0); // still gone, not resurrected
        });
    });
});
