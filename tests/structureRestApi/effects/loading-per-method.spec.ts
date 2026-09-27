/**
 * EFFECT STABILITY — every fetch/mutate method correctly drives `isLoading()`.
 *
 * `isLoading()` is derived from `queryClient.isFetching()`/`isMutating()`: true while the
 * request is in flight, false once it settles. Every call counts; there is no opt-out.
 * Table-driven so every method is held to the identical contract.
 */

import { makeComposable, clearAllInstances, flush } from '../_helpers/harness';
import { deferredApi } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

type C = ReturnType<typeof makeComposable<IUser, number>>;

interface IMethodCase {
    name: string;
    /** value the deferred apiCall resolves with (shape differs per method) */
    value: unknown;
    /** whether `isLoading()` is expected true synchronously after the call (false for
     *  methods that start their mutation behind an initial cancelQueries microtask) */
    syncStart: boolean;
    run: (c: C, call: jest.Mock) => Promise<unknown>;
}

const list = [USERS[0]];
const one = USERS[0];

const cases: IMethodCase[] = [
    { name: 'fetchAll', value: list, syncStart: true, run: (c, call) => c.fetchAll(call) },
    {
        name: 'fetchByParent',
        value: list,
        syncStart: true,
        run: (c, call) => c.fetchByParent(call, 10)
    },
    {
        name: 'fetchTarget (with id)',
        value: one,
        syncStart: true,
        run: (c, call) => c.fetchTarget(call, 1)
    },
    {
        name: 'fetchTarget (no id)',
        value: one,
        syncStart: true,
        run: (c, call) => c.fetchTarget(call)
    },
    {
        name: 'fetchMultiple',
        value: list,
        syncStart: true,
        run: (c, call) => c.fetchMultiple(call, [1])
    },
    {
        name: 'fetchPaginate',
        value: list,
        syncStart: true,
        run: (c, call) => c.fetchPaginate(call, 1, 10)
    },
    {
        name: 'fetchAny (cached)',
        value: { ok: true },
        syncStart: true,
        run: (c, call) => c.fetchAny(call, { key: ['x'] })
    },
    {
        name: 'fetchAny (uncached)',
        value: { ok: true },
        syncStart: true,
        run: (c, call) => c.fetchAny(call)
    },
    {
        name: 'mutateAny',
        value: { ok: true },
        syncStart: true,
        run: (c, call) => c.mutateAny(call)
    },
    {
        name: 'createTarget',
        value: { id: 99, name: 'new', email: 'n@e.com' },
        syncStart: true,
        run: (c, call) => c.createTarget(call)
    },
    {
        name: 'updateTarget',
        value: one,
        syncStart: false, // the mutation is constructed after the initial cancelQueries microtask
        run: (c, call) => c.updateTarget(call, { id: 1, name: 'x' }, 1)
    },
    {
        name: 'deleteTarget',
        value: { id: 1 },
        syncStart: false,
        run: (c, call) => c.deleteTarget(call, 1)
    }
];

describe('EFFECT STABILITY · isLoading per method', () => {
    describe.each(cases)('$name', ({ value, syncStart, run }) => {
        it('isLoading() is true in flight and false after it settles', async () => {
            const c = makeComposable<IUser, number>();
            const { call, control } = deferredApi<unknown>();

            const p = run(c, call);

            // when the mutation is constructed after a leading cancelQueries() chain, flush a
            // full macrotask so those microtasks settle, while the apiCall is still pending
            if (!syncStart) await flush(1);

            expect(c.isLoading()).toBe(true);

            control.resolve(value);
            await p;

            expect(c.isLoading()).toBe(false);
        });
    });
});
