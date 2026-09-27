/**
 * @jest-environment @stryker-mutator/jest-runner/jest-env/jsdom
 *
 * Plain 'jsdom' also runs under `npm test`, but Stryker's jest-runner needs its own
 * coverage-instrumented wrapper around jest-environment-jsdom to mutation-test this file —
 * see stryker-mutator.io/docs/stryker-js/jest-runner#coverage-analysis.
 *
 * BROWSER — garbage collection. Untestable under Jest's default Node environment: TanStack reads
 * `typeof window === 'undefined'` once, at import time, to decide "server" (`gcTime` defaults to
 * `Infinity`) or "browser" (`gcTime` defaults to 5 minutes, TanStack's own default). Node has no
 * `window`, so every query there behaves as if `gcTime: Infinity` were already the default —
 * dropping the resource's own explicit `Infinity` from `src/internal/restResource.ts`
 * (`queryClient.setQueryDefaults([resourceKey, 'target'|'parent'], { gcTime: Infinity })`) would
 * change nothing under Node. Only under jsdom does a real 5-minute default exist to fall back to.
 *
 * Per-kind expectation, from the source (`src/internal/restResource.ts`,
 * `src/internal/queryRecordStore.ts`, `src/internal/parentRelations.ts`):
 *   - `target` (records) and `parent` (belongsTo lists) — explicit `gcTime: Infinity`: survive.
 *   - `all`/`page`/`search`/`any` — no override: TanStack's own default (5 min unwatched) applies.
 */
import { makeComposable, clearAllInstances } from '../structureRestApi/_helpers/harness';
import { apiResolve } from '../structureRestApi/_helpers/fakeApi';
import { useFakeClock, advance, restoreClock } from '../structureRestApi/_helpers/time';
import { USERS, type IUser } from '../structureRestApi/_helpers/fixtures';

const FIVE_MINUTES = 5 * 60 * 1000;

describe('BROWSER · garbage collection', () => {
    beforeEach(() => useFakeClock());
    afterEach(() => {
        clearAllInstances();
        restoreClock();
    });

    it('a record survives 5 minutes unwatched (gcTime: Infinity, explicit)', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchTarget(apiResolve(USERS[0]), 1);
        expect(
            c.queryClient.getQueryCache().find({ queryKey: ['resource', 'target', [], '1'] })
        ).toBeDefined();

        await advance(FIVE_MINUTES + 1);

        expect(
            c.queryClient.getQueryCache().find({ queryKey: ['resource', 'target', [], '1'] })
        ).toBeDefined();
        expect(c.getRecord(1)).toEqual(USERS[0]);
    });

    it('a belongsTo parent list survives 5 minutes unwatched (gcTime: Infinity, explicit)', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchByParent(apiResolve([USERS[0]]), 1);
        const key = ['resource', 'parent', [], '1'];
        expect(c.queryClient.getQueryCache().find({ queryKey: key })).toBeDefined();

        await advance(FIVE_MINUTES + 1);

        expect(c.queryClient.getQueryCache().find({ queryKey: key })).toBeDefined();
        expect(c.getListByParent(1)).toEqual([USERS[0]]);
    });

    it('an unwatched fetchAll entry ("all") is collected once its gcTime elapses', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchAll(apiResolve([...USERS]));
        const key = ['resource', 'all', []];
        expect(c.queryClient.getQueryCache().find({ queryKey: key })).toBeDefined();

        await advance(FIVE_MINUTES + 1);

        expect(c.queryClient.getQueryCache().find({ queryKey: key })).toBeUndefined();
        // The records themselves (gcTime: Infinity) are unaffected by the list entry's collection.
        expect(c.getRecord(1)).toEqual(USERS[0]);
    });

    it('an unwatched fetchAny(key) entry ("any") is collected once its gcTime elapses', async () => {
        const c = makeComposable<IUser, number>();
        await c.fetchAny(() => Promise.resolve('stats'), { key: ['stats'] });
        const key = ['resource', 'any', [], 'stats'];
        expect(c.queryClient.getQueryCache().find({ queryKey: key })).toBeDefined();

        await advance(FIVE_MINUTES + 1);

        expect(c.queryClient.getQueryCache().find({ queryKey: key })).toBeUndefined();
    });

    it('an ACTIVE watcher keeps its "all" entry alive past 5 minutes: gc only collects the unwatched', async () => {
        const c = makeComposable<IUser, number>();
        const { stop } = c.watchAll(apiResolve([...USERS]));
        await advance(0); // fake timers are active; flush() waits on real timers and would hang
        const key = ['resource', 'all', []];
        expect(c.queryClient.getQueryCache().find({ queryKey: key })).toBeDefined();

        await advance(FIVE_MINUTES + 1);

        // Still observed by the active watcher: gc never schedules for it.
        expect(c.queryClient.getQueryCache().find({ queryKey: key })).toBeDefined();
        stop();
    });
});
