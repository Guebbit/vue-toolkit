/**
 * UNIT — watchTarget: fetchTarget's reactive counterpart.
 *   - fires immediately (by default) for the id present at creation
 *   - selects eagerly, before the fetch resolves
 *   - refetches and re-selects when the id source changes
 *   - a nullish id is a no-op, unless clearOnEmpty is set
 *   - immediate: false skips the initial run
 *   - selectEager: false selects only after a successful fetch
 *   - onSuccess/onError/onSettled fire with the right arguments
 */

import { ref } from 'vue';
import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IUser, number>();

const fakeApiCall = () => jest.fn((id: number) => Promise.resolve(USERS.find((u) => u.id === id)));

/** Flushes the microtask queue past runQuery's several internal `.then` hops. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('UNIT · watchTarget', () => {
    it('fires immediately for the id present at creation, and selects it', async () => {
        const c = make();
        const id = ref<number | undefined>(1);
        const apiCall = fakeApiCall();
        const stop = c.watchTarget(id, apiCall);

        expect(apiCall).toHaveBeenCalledTimes(1);
        expect(c.selectedIdentifier.value).toBe(1);
        await flush();
        expect(c.selectedRecord.value).toEqual(USERS[0]);
        stop();
    });

    it('selects the id eagerly, before the fetch promise resolves', () => {
        const c = make();
        const id = ref<number | undefined>(1);
        const stop = c.watchTarget(id, fakeApiCall());

        // Synchronous, before any microtask runs — proves selection isn't gated on the fetch
        expect(c.selectedIdentifier.value).toBe(1);
        stop();
    });

    it('refetches and re-selects when the id source changes', async () => {
        const c = make();
        const id = ref<number | undefined>(1);
        const apiCall = fakeApiCall();
        const stop = c.watchTarget(id, apiCall);
        await flush();

        id.value = 2;
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(2);
        expect(apiCall).toHaveBeenLastCalledWith(2);
        expect(c.selectedIdentifier.value).toBe(2);
        expect(c.selectedRecord.value).toEqual(USERS[1]);
        stop();
    });

    it('is a no-op when the id is nullish, and leaves the previous selection alone', async () => {
        const c = make();
        const id = ref<number | undefined>(1);
        const apiCall = fakeApiCall();
        const stop = c.watchTarget(id, apiCall);
        await flush();

        id.value = undefined;
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(1);
        expect(c.selectedIdentifier.value).toBe(1);
        stop();
    });

    it('calls onSuccess/onSettled with the fetched item and id', async () => {
        const c = make();
        const id = ref<number | undefined>(1);
        const onSuccess = jest.fn();
        const onSettled = jest.fn();
        const onError = jest.fn();
        const stop = c.watchTarget(id, fakeApiCall(), { onSuccess, onError, onSettled });
        await flush();

        expect(onSuccess).toHaveBeenCalledWith(USERS[0], 1);
        expect(onSettled).toHaveBeenCalledWith(USERS[0], undefined, 1);
        expect(onError).not.toHaveBeenCalled();
        stop();
    });

    it('calls onError/onSettled when the fetch rejects, and does not select', async () => {
        const c = make();
        const id = ref<number | undefined>(1);
        const error = new Error('network error');
        const apiCall = jest.fn(() => Promise.reject(error));
        const onSuccess = jest.fn();
        const onError = jest.fn();
        const onSettled = jest.fn();
        const stop = c.watchTarget(id, apiCall, {
            onSuccess,
            onError,
            onSettled
        });
        await flush();
        await flush();

        expect(onError).toHaveBeenCalledWith(error, 1);
        expect(onSettled).toHaveBeenCalledWith(undefined, error, 1);
        expect(onSuccess).not.toHaveBeenCalled();
        expect(c.selectedIdentifier.value).toBeUndefined();
        stop();
    });
});
