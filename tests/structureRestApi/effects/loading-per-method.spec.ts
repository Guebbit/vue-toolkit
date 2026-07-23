/**
 * EFFECT STABILITY — every fetch/mutate method drives the ref-counted `loading`
 * flag correctly.
 *
 * The other loading spec proves the ref-count arithmetic; this one proves each
 * PUBLIC method is actually wired to it: `loading` goes true while the request is
 * in flight and returns to false once it settles, and honours `{ loading: false }`
 * by never toggling at all. Table-driven so every method is held to the identical
 * contract — a method that forgets its `startLoading`/`stopLoading` (or whose
 * `finally` never runs) is caught here regardless of which method it is.
 */

import { watch } from 'vue';
import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { deferredApi } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

type C = ReturnType<typeof makeComposable<IUser, number>>;

interface IMethodCase {
    name: string;
    /** value the deferred apiCall resolves with (shape differs per method) */
    value: unknown;
    /** whether `loading` is expected true synchronously after the call (false for
     *  methods that startLoading behind an initial cancelQueries microtask) */
    syncStart: boolean;
    run: (c: C, call: jest.Mock) => Promise<unknown>;
    runNoLoading: (c: C, call: jest.Mock) => Promise<unknown>;
}

const list = [USERS[0]];
const one = USERS[0];

const cases: IMethodCase[] = [
    {
        name: 'fetchAll',
        value: list,
        syncStart: true,
        run: (c, call) => c.fetchAll(call),
        runNoLoading: (c, call) => c.fetchAll(call, { loading: false })
    },
    {
        name: 'fetchByParent',
        value: list,
        syncStart: true,
        run: (c, call) => c.fetchByParent(call, 10),
        runNoLoading: (c, call) => c.fetchByParent(call, 10, { loading: false })
    },
    {
        name: 'fetchTarget (with id)',
        value: one,
        syncStart: true,
        run: (c, call) => c.fetchTarget(call, 1),
        runNoLoading: (c, call) => c.fetchTarget(call, 1, { loading: false })
    },
    {
        name: 'fetchTarget (no id)',
        value: one,
        syncStart: true,
        run: (c, call) => c.fetchTarget(call),
        runNoLoading: (c, call) => c.fetchTarget(call, undefined, { loading: false })
    },
    {
        name: 'fetchMultiple',
        value: list,
        syncStart: true,
        run: (c, call) => c.fetchMultiple(call, [1]),
        runNoLoading: (c, call) => c.fetchMultiple(call, [1], { loading: false })
    },
    {
        name: 'fetchPaginate',
        value: list,
        syncStart: true,
        run: (c, call) => c.fetchPaginate(call, 1, 10),
        runNoLoading: (c, call) => c.fetchPaginate(call, 1, 10, { loading: false })
    },
    {
        name: 'fetchAny (cached)',
        value: { ok: true },
        syncStart: true,
        run: (c, call) => c.fetchAny(call, { lastUpdateKey: 'x' }),
        runNoLoading: (c, call) => c.fetchAny(call, { lastUpdateKey: 'x', loading: false })
    },
    {
        name: 'fetchAny (uncached)',
        value: { ok: true },
        syncStart: true,
        run: (c, call) => c.fetchAny(call),
        runNoLoading: (c, call) => c.fetchAny(call, { loading: false })
    },
    {
        name: 'createTarget',
        value: { id: 99, name: 'new', email: 'n@e.com' },
        syncStart: true,
        run: (c, call) => c.createTarget(call),
        runNoLoading: (c, call) => c.createTarget(call, undefined, { loading: false })
    },
    {
        name: 'updateTarget',
        value: one,
        syncStart: false, // startLoading runs after the initial cancelQueries microtask
        run: (c, call) => c.updateTarget(call, { id: 1, name: 'x' }, 1),
        runNoLoading: (c, call) => c.updateTarget(call, { id: 1, name: 'x' }, 1, { loading: false })
    },
    {
        name: 'deleteTarget',
        value: { id: 1 },
        syncStart: false,
        run: (c, call) => c.deleteTarget(call, 1),
        runNoLoading: (c, call) => c.deleteTarget(call, 1, { loading: false })
    }
];

describe('EFFECT STABILITY · loading per method', () => {
    describe.each(cases)('$name', ({ value, syncStart, run, runNoLoading }) => {
        it('loading is true in flight and false after it settles', async () => {
            const c = makeComposable<IUser, number>();
            const { call, control } = deferredApi<unknown>();

            const p = run(c, call);

            // when startLoading runs after a leading cancelQueries() chain, flush a full
            // macrotask so those microtasks settle, while the deferred apiCall is still pending
            if (!syncStart) await new Promise((r) => setTimeout(r, 0));

            expect(c.loading.value).toBe(true);

            control.resolve(value);
            await p;

            expect(c.loading.value).toBe(false); // finally ran -> stopLoading -> back to false
        });

        it('{ loading: false } never toggles the flag', async () => {
            const c = makeComposable<IUser, number>();
            const seen: boolean[] = [];
            const stop = watch(c.loading, (v) => seen.push(v), { flush: 'sync' });
            const { call, control } = deferredApi<unknown>();

            const p = runNoLoading(c, call);
            control.resolve(value);
            await p;
            stop();

            expect(seen).not.toContain(true);
            expect(c.loading.value).toBe(false);
        });
    });
});
