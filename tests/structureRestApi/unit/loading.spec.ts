/**
 * UNIT — isLoading(): the plain-function loading primitive, backed by TanStack's own
 * isFetching()/isMutating() rather than a hand-kept ref-counted map.
 *   - isLoading() is false before anything happens
 *   - a fetch flips it true during the call and false afterwards
 *   - isLoading(key) matches only calls tagged with that key, by PREFIX of segments —
 *     on a query (fetchAny) and a mutation (mutateAny) alike
 *
 * (Concurrency/ref-counting and the rejection case are in modifiers/loading.spec.ts.)
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { deferredApi } from '../_helpers/fakeApi';
import { USERS, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IUser, number>();

describe('UNIT · isLoading', () => {
    it('is false initially', () => {
        const c = make();
        expect(c.isLoading()).toBe(false);
    });

    it('is true during a fetch and false after it resolves', async () => {
        const c = make();
        let during = false;
        await c.fetchAll(
            jest.fn(() => {
                during = c.isLoading();
                return Promise.resolve([...USERS]);
            })
        );
        expect(during).toBe(true);
        expect(c.isLoading()).toBe(false);
    });

    it('isLoading(key) only matches calls tagged with that key', async () => {
        const c = make();
        let matchedDuring = false;
        let unrelatedDuring = true;
        await c.fetchAny(
            jest.fn(() => {
                matchedDuring = c.isLoading(['report']);
                unrelatedDuring = c.isLoading(['something-else']);
                return Promise.resolve('ok');
            }),
            { key: ['report'] }
        );
        expect(matchedDuring).toBe(true);
        expect(unrelatedDuring).toBe(false);
    });

    describe.each([
        {
            kind: 'query (fetchAny)',
            run: (c: ReturnType<typeof make>, call: () => Promise<string>) =>
                c.fetchAny(call, { key: ['dash', 'w1'] })
        },
        {
            kind: 'mutation (mutateAny)',
            run: (c: ReturnType<typeof make>, call: () => Promise<string>) =>
                c.mutateAny(call, { key: ['dash', 'w1'] })
        }
    ])('isLoading(key) prefix semantics on a $kind keyed [dash, w1]', ({ run }) => {
        it('matches the key and every leading part of it, nothing else', async () => {
            const c = make();
            const { call, control } = deferredApi<string>();
            const pending = run(c, call);

            expect(c.isLoading()).toBe(true);
            expect(c.isLoading(['dash'])).toBe(true);
            expect(c.isLoading(['dash', 'w1'])).toBe(true);
            expect(c.isLoading(['dash', 'w2'])).toBe(false); // a sibling bucket
            expect(c.isLoading(['w1'])).toBe(false); // a trailing segment is not a prefix
            expect(c.isLoading(['dash', 'w1', 'extra'])).toBe(false); // longer than the key

            control.resolve('done');
            await pending;
            expect(c.isLoading(['dash'])).toBe(false);
        });
    });
});
