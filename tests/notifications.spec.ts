import { createPinia, setActivePinia } from 'pinia';
import { useNotificationsStore, EToastType } from '../src/stores/notifications';

describe('useNotificationsStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it("is registered under the 'notifications' id", () => {
        expect(useNotificationsStore().$id).toBe('notifications');
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

    // the returned id is what lets a caller hide/show/remove the message it just added
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
    describe('persistent messages', () => {
        it('uses the caller-owned id', () => {
            const store = useNotificationsStore();
            const id = store.addMessage('Server row', EToastType.PRIMARY, -1, { id: 'srv-1' });
            expect(id).toBe('srv-1');
            expect(store.history[0]!.id).toBe('srv-1');
        });

        it('defaults persistent to false and createdAt to now', () => {
            jest.useFakeTimers().setSystemTime(5000);
            const store = useNotificationsStore();
            store.addMessage('Plain');
            jest.useRealTimers();
            expect(store.history[0]!.persistent).toBe(false);
            expect(store.history[0]!.createdAt).toBe(5000);
        });

        it('stores persistent, createdAt and meta as given', () => {
            const store = useNotificationsStore();
            store.addMessage('Row', EToastType.WARNING, -1, {
                persistent: true,
                createdAt: 42,
                meta: { code: 'cart.removed' }
            });
            expect(store.history[0]).toMatchObject({
                persistent: true,
                createdAt: 42,
                meta: { code: 'cart.removed' }
            });
        });

        it('lists persistentMessages newest first, hidden ones included', () => {
            const store = useNotificationsStore();
            store.addMessage('old', EToastType.PRIMARY, -1, { persistent: true, createdAt: 1 });
            store.addMessage('toast');
            const newest = store.addMessage('new', EToastType.PRIMARY, -1, {
                persistent: true,
                createdAt: 3
            });
            store.addMessage('mid', EToastType.PRIMARY, -1, { persistent: true, createdAt: 2 });
            store.hideMessage(newest);

            expect(store.persistentMessages.map(({ message }) => message)).toEqual([
                'new',
                'mid',
                'old'
            ]);
            expect(store.messages.map(({ message }) => message)).toEqual(['old', 'toast', 'mid']);
        });

        it('keeps the callback out of history', () => {
            const store = useNotificationsStore();
            store.addMessage('Row', EToastType.PRIMARY, -1, { onDismiss: jest.fn() });
            expect(Object.values(store.history[0]!)).not.toContainEqual(expect.any(Function));
        });
    });

    describe('re-adding a known id', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        it('updates in place instead of adding', () => {
            const store = useNotificationsStore();
            store.addMessage('v1', EToastType.PRIMARY, -1, { id: 'a', createdAt: 1 });
            const id = store.addMessage('v2', EToastType.DANGER, -1, {
                id: 'a',
                persistent: true,
                createdAt: 99,
                meta: { n: 2 }
            });

            expect(id).toBe('a');
            expect(store.history).toHaveLength(1);
            expect(store.history[0]).toMatchObject({
                message: 'v2',
                type: EToastType.DANGER,
                persistent: true,
                meta: { n: 2 },
                createdAt: 1
            });
        });

        it('resets persistent to false when the update does not say', () => {
            const store = useNotificationsStore();
            store.addMessage('v1', EToastType.PRIMARY, -1, { id: 'a', persistent: true });
            store.addMessage('v2', EToastType.PRIMARY, -1, { id: 'a' });
            expect(store.persistentMessages).toHaveLength(0);
        });

        it('keeps visible: a refetch does not bring back a closed toast', () => {
            const store = useNotificationsStore();
            store.addMessage('v1', EToastType.PRIMARY, -1, { id: 'a' });
            store.hideMessage('a');
            store.addMessage('v1', EToastType.PRIMARY, -1, { id: 'a' });
            expect(store.messages).toHaveLength(0);
        });

        it('does not re-arm the timeout', () => {
            const store = useNotificationsStore();
            store.addMessage('v1', EToastType.PRIMARY, 1000, { id: 'a' });
            store.showMessage('a');
            jest.advanceTimersByTime(1000);
            expect(store.messages).toHaveLength(0); // first timer hid it
            store.showMessage('a');
            store.addMessage('v2', EToastType.PRIMARY, 1000, { id: 'a' }); // would re-arm
            jest.advanceTimersByTime(1000);
            expect(store.messages).toHaveLength(1); // nothing hid it again
        });

        it('replaces the onDismiss, and clears it when the update has none', async () => {
            const store = useNotificationsStore();
            const first = jest.fn();
            const second = jest.fn();
            store.addMessage('v1', EToastType.PRIMARY, -1, { id: 'a', onDismiss: first });
            store.addMessage('v2', EToastType.PRIMARY, -1, { id: 'a', onDismiss: second });
            await store.dismissMessage('a');
            expect(first).not.toHaveBeenCalled();
            expect(second).toHaveBeenCalledTimes(1);

            store.addMessage('v1', EToastType.PRIMARY, -1, { id: 'b', onDismiss: first });
            store.addMessage('v2', EToastType.PRIMARY, -1, { id: 'b' });
            await store.dismissMessage('b');
            expect(first).not.toHaveBeenCalled();
        });
    });

    describe('dismissMessage', () => {
        it('removes the message and calls onDismiss once', async () => {
            const store = useNotificationsStore();
            const onDismiss = jest.fn();
            const id = store.addMessage('Row', EToastType.PRIMARY, -1, { onDismiss });

            await store.dismissMessage(id);

            expect(store.history).toHaveLength(0);
            expect(onDismiss).toHaveBeenCalledTimes(1);
        });

        it('removes optimistically, before onDismiss settles', async () => {
            const store = useNotificationsStore();
            const gate = Promise.withResolvers<void>();
            const id = store.addMessage('Row', EToastType.PRIMARY, -1, {
                onDismiss: () => gate.promise
            });

            const pending = store.dismissMessage(id);
            expect(store.history).toHaveLength(0);
            gate.resolve();
            await pending;
        });

        it('works without an onDismiss', async () => {
            const store = useNotificationsStore();
            const id = store.addMessage('Row');
            await expect(store.dismissMessage(id)).resolves.toBeUndefined();
            expect(store.history).toHaveLength(0);
        });

        it.each([
            ['rejects', () => Promise.reject(new Error('boom'))],
            [
                'throws synchronously',
                () => {
                    throw new Error('boom');
                }
            ]
        ])(
            'restores the message at its original index and re-throws when onDismiss %s',
            async (_n, onDismiss) => {
                const store = useNotificationsStore();
                store.addMessage('first', EToastType.PRIMARY, -1, { id: 'a' });
                store.addMessage('second', EToastType.PRIMARY, -1, { id: 'b', onDismiss });
                store.addMessage('third', EToastType.PRIMARY, -1, { id: 'c' });

                await expect(store.dismissMessage('b')).rejects.toThrow('boom');

                expect(store.history.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
                // the callback is back too: a retry reaches it again
                await expect(store.dismissMessage('b')).rejects.toThrow('boom');
            }
        );

        it('restores at the end when the history shrank meanwhile', async () => {
            const store = useNotificationsStore();
            store.addMessage('first', EToastType.PRIMARY, -1, { id: 'a' });
            const gate = Promise.withResolvers<void>();
            store.addMessage('second', EToastType.PRIMARY, -1, {
                id: 'b',
                onDismiss: () => gate.promise
            });

            const pending = store.dismissMessage('b');
            store.removeMessage('a');
            gate.reject(new Error('boom'));
            await expect(pending).rejects.toThrow('boom');

            expect(store.history.map(({ id }) => id)).toEqual(['b']);
        });

        it('does not duplicate when the id was re-added while onDismiss was failing', async () => {
            const store = useNotificationsStore();
            const gate = Promise.withResolvers<void>();
            store.addMessage('old', EToastType.PRIMARY, -1, {
                id: 'a',
                onDismiss: () => gate.promise
            });

            const pending = store.dismissMessage('a');
            store.addMessage('refetched', EToastType.PRIMARY, -1, { id: 'a' });
            gate.reject(new Error('boom'));
            await expect(pending).rejects.toThrow('boom');

            expect(store.history).toHaveLength(1);
            expect(store.history[0]!.message).toBe('refetched');
        });

        it('is a no-op for an unknown id', async () => {
            const store = useNotificationsStore();
            store.addMessage('Row');
            await expect(store.dismissMessage('nope')).resolves.toBeUndefined();
            expect(store.history).toHaveLength(1);
        });
    });

    describe('onDismiss is only for dismissMessage', () => {
        it('removeMessage and hideMessage never call it', async () => {
            const store = useNotificationsStore();
            const onDismiss = jest.fn();
            const id = store.addMessage('Row', EToastType.PRIMARY, -1, { onDismiss });

            store.hideMessage(id);
            store.removeMessage(id);
            await Promise.resolve();

            expect(onDismiss).not.toHaveBeenCalled();
        });

        it('removeMessage forgets the callback, so a re-added id starts clean', async () => {
            const store = useNotificationsStore();
            const onDismiss = jest.fn();
            store.addMessage('Row', EToastType.PRIMARY, -1, { id: 'a', onDismiss });
            store.removeMessage('a');
            store.addMessage('Row', EToastType.PRIMARY, -1, { id: 'a' });

            await store.dismissMessage('a');

            expect(onDismiss).not.toHaveBeenCalled();
        });
    });
});
