/**
 * UNIT — watchAll / watchByParent settle callbacks, like watchTarget's and watchSearch's:
 *   - onSuccess/onSettled after a fetch, with the listed records and the context
 *     (watchAll: the bucket key; watchByParent: the parent id)
 *   - onError/onSettled after a failure, with the error
 *   - a switch to a list already cached and fresh settles without a fetch
 *   - a nullish parent settles nothing
 */

import { ref } from 'vue';
import { makeComposable, clearAllInstances, flush } from '../_helpers/harness';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IUser, number>();

describe('UNIT · watchAll callbacks', () => {
    it('calls onSuccess/onSettled with the listed records and the bucket key', async () => {
        const c = make();
        const onSuccess = jest.fn();
        const onSettled = jest.fn();
        c.watchAll(() => Promise.resolve([...USERS]), { key: ['widget'], onSuccess, onSettled });
        await flush();

        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect(onSuccess).toHaveBeenCalledWith(USERS, ['widget']);
        expect(onSettled).toHaveBeenCalledWith(USERS, undefined, ['widget']);
    });

    it('calls onError/onSettled with the failure', async () => {
        const c = make();
        const failure = new Error('down');
        const onError = jest.fn();
        const onSettled = jest.fn();
        c.watchAll(() => Promise.reject(failure), {
            onError,
            onSettled,
            queryOptions: { retry: false }
        });
        await flush();

        expect(onError).toHaveBeenCalledWith(failure, undefined);
        expect(onSettled).toHaveBeenCalledWith(undefined, failure, undefined);
    });

    it('settles a switch to a bucket already cached and fresh, without fetching', async () => {
        const c = make();
        await c.fetchAll(() => Promise.resolve([USERS[0]]), { key: ['b'] });
        const key = ref(['a']);
        const apiCall = jest.fn(() => Promise.resolve([USERS[1]]));
        const onSuccess = jest.fn();
        c.watchAll(apiCall, { key, onSuccess });
        await flush();
        onSuccess.mockClear();

        key.value = ['b'];
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(1); // only bucket 'a' was fetched
        expect(onSuccess).toHaveBeenCalledWith([USERS[0]], ['b']);
    });
});

describe('UNIT · watchByParent callbacks', () => {
    it('calls onSuccess with the children and the parent id', async () => {
        const c = make();
        const onSuccess = jest.fn();
        c.watchByParent(() => Promise.resolve([USERS[0]]), 10, { onSuccess });
        await flush();

        expect(onSuccess).toHaveBeenCalledWith([USERS[0]], 10);
    });

    it('settles nothing while the parent id is nullish', async () => {
        const c = make();
        const onSuccess = jest.fn();
        const onSettled = jest.fn();
        c.watchByParent(() => Promise.resolve([USERS[0]]), ref<number | undefined>(), {
            onSuccess,
            onSettled
        });
        await flush();

        expect(onSuccess).not.toHaveBeenCalled();
        expect(onSettled).not.toHaveBeenCalled();
    });
});
