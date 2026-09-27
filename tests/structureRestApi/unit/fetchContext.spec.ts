/**
 * UNIT — every read apiCall receives a `{ signal }` context as its last argument (V2.1).
 *
 * `signal` is a real `AbortSignal`, aborted once TanStack cancels the read it belongs to (an
 * update/delete of the same record, here) — a caller that forwards it to `fetch`/axios gets a
 * request genuinely cancelled, not just a promise whose answer is later discarded.
 */

import { deferred, deferredApi } from '../_helpers/fakeApi';
import { makeComposable, clearAllInstances, flush } from '../_helpers/harness';
import { USERS, type IUser } from '../_helpers/fixtures';
import type { IFetchContext } from '../../../src/composables/structureRestApi';

afterEach(clearAllInstances);

describe('UNIT · the read context (signal)', () => {
    it('fetchTarget receives a context whose signal is a real, initially un-aborted AbortSignal', async () => {
        const c = makeComposable<IUser, number>();
        let captured: AbortSignal | undefined;
        const apiCall = jest.fn((context: IFetchContext) => {
            captured = context.signal;
            return Promise.resolve(USERS[0]);
        });

        await c.fetchTarget(apiCall, 1);

        expect(captured).toBeInstanceOf(AbortSignal);
        expect(captured?.aborted).toBe(false);
    });

    it('the signal aborts once a mutation cancels the read it belongs to', async () => {
        const c = makeComposable<IUser, number>();
        let captured: AbortSignal | undefined;
        const read = deferred<IUser>();
        const apiCall = jest.fn((context: IFetchContext) => {
            captured = context.signal;
            return read.promise;
        });

        const pendingRead = c.fetchTarget(apiCall, 1, { forced: true });
        await flush();
        expect(captured?.aborted).toBe(false);

        const save = deferredApi<IUser>();
        const pendingUpdate = c.updateTarget(save.call, { name: 'Edited' }, 1);
        await flush();

        expect(captured?.aborted).toBe(true);

        read.resolve(USERS[0]);
        await pendingRead;
        save.control.resolve({ ...USERS[0], name: 'Edited' });
        await pendingUpdate;
    });

    it('an apiCall that ignores the context entirely still works (it is purely additive)', async () => {
        const c = makeComposable<IUser, number>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- exercising a zero-arg legacy-style call on purpose
        const legacyStyle: any = jest.fn(() => Promise.resolve(USERS[0]));

        await expect(c.fetchTarget(legacyStyle, 1)).resolves.toEqual(USERS[0]);
        expect(c.getRecord(1)).toEqual(USERS[0]);
    });
});
