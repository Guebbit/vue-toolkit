/**
 * LIFECYCLE — maxRecords: what the bound refuses to evict.
 *
 * maxRecords.spec.ts proves the bound evicts. This spec pins the other half: what a wipe
 * leaves alone. Alias entries do not count as records; the rows of a watched list, the record
 * behind a watched alias, a query someone observes and a query still fetching all survive; a
 * list is never exempt just because its key looks like a protected id; another scope is not
 * touched; a bound of zero or less means "no bound".
 */

import { ref } from 'vue';
import { makeComposable, clearAllInstances, flush, newTestClient } from '../_helpers/harness';
import { apiResolve, deferredApi } from '../_helpers/fakeApi';
import { buildArticles, type IArticle } from '../_helpers/fixtures';

afterEach(clearAllInstances);

/** Query key of an `all` list under the default (empty) scope. */
const allKey = (...key: string[]) => ['resource', 'all', [], ...key];

/** One article with the given id. */
const article = (id: number) => buildArticles(1, 'tech', id)[0];

describe('LIFECYCLE · maxRecords protection', () => {
    it('an alias entry does not count toward the bound', async () => {
        const c = makeComposable<IArticle, number | string>({ maxRecords: 3 });
        await c.fetchTarget(apiResolve(article(1)), 1);
        // fetched by a slug: stores record 2 plus a data-less alias entry under 'slug'
        await c.fetchTarget(apiResolve(article(2)), 'slug');

        // 2 records + 1 new = 3, exactly the bound. Were the alias counted it would be 4.
        await c.fetchTarget(apiResolve(article(3)), 3);

        expect(c.getRecord(1)).toBeDefined();
        expect(c.getRecord(2)).toBeDefined();
        expect(c.getRecord(3)).toBeDefined();
    });

    it('keeps every row of a watched list, by string id, without fetching it again', async () => {
        const c = makeComposable<IArticle, number>({ maxRecords: 6 });
        const listCall = jest.fn(() => Promise.resolve(buildArticles(5, 'tech', 1)));
        const watched = c.watchAll(listCall);
        await flush();

        // 5 cached + 3 new crosses the bound of 6
        await c.fetchAll(apiResolve(buildArticles(3, 'tech', 100)), { key: ['other'] });
        await flush();

        for (const id of [1, 2, 3, 4, 5]) expect(c.getRecord(id)).toEqual(article(id));
        expect(listCall).toHaveBeenCalledTimes(1);
        watched.stop();
    });

    it('a watched list still loading (no data yet) does not break a crossing', async () => {
        const c = makeComposable<IArticle, number>({ maxRecords: 2 });
        await c.fetchAll(apiResolve(buildArticles(2, 'tech', 1)), { key: ['a'] });
        const pending = deferredApi<IArticle[]>();
        const watched = c.watchAll(pending.call, { key: ['watched'] });
        await flush();

        // the watched list has an observer and no data: the wipe must read it as "no rows"
        await expect(
            c.fetchAll(apiResolve(buildArticles(2, 'tech', 100)), { key: ['b'] })
        ).resolves.toHaveLength(2);

        pending.control.resolve([]);
        watched.stop();
    });

    it('a watched alias whose record is not loaded yet does not break a crossing', async () => {
        const c = makeComposable<IArticle, number | string>({ maxRecords: 2 });
        await c.fetchAll(apiResolve(buildArticles(2, 'tech', 1)), { key: ['a'] });
        const pending = deferredApi<IArticle | undefined>();
        const watched = c.watchTarget(pending.call, ref('slug'));
        await flush();

        await expect(
            c.fetchAll(apiResolve(buildArticles(2, 'tech', 100)), { key: ['b'] })
        ).resolves.toHaveLength(2);

        pending.control.resolve(article(9));
        watched.stop();
    });

    it('keeps the record behind a watched alias, and the alias still serves it', async () => {
        const c = makeComposable<IArticle, number | string>({ maxRecords: 3 });
        const watched = c.watchTarget(() => Promise.resolve(article(7)), ref('my-slug'));
        await flush();
        expect(c.getRecord(7)).toEqual(article(7));

        await c.fetchAll(apiResolve(buildArticles(3, 'tech', 100)));
        await flush();

        expect(c.getRecord(7)).toEqual(article(7));
        expect(c.selectedRecord.value).toEqual(article(7));
        watched.stop();
    });

    it('spares only the writing query: another unobserved list of the same scope is dropped', async () => {
        const c = makeComposable<IArticle, number>({ maxRecords: 3 });
        // 'a','b' extends the crossing query's key ('a'): a prefix match must not spare it
        const nested = apiResolve(buildArticles(3, 'tech', 1));
        await c.fetchAll(nested, { key: ['a', 'b'] });
        expect(nested).toHaveBeenCalledTimes(1);

        await c.fetchAll(apiResolve(buildArticles(2, 'tech', 100)), { key: ['a'] });

        expect(c.queryClient.getQueryData(allKey('a', 'b'))).toBeUndefined();
        expect(c.getRecord(1)).toBeUndefined();
        // the writing query itself is still there
        expect(c.queryClient.getQueryData(allKey('a'))).toBeDefined();
    });

    it('never drops a query something observes, unprotected or not', async () => {
        const c = makeComposable<IArticle, number>({ maxRecords: 6 });
        const listCall = jest.fn(() => Promise.resolve(buildArticles(2, 'tech', 1)));
        const watchedList = c.watchAll(listCall, { key: ['watched'] });
        const watchedTarget = c.watchTarget(() => Promise.resolve(article(50)), ref(50));
        await flush();

        await c.fetchAll(apiResolve(buildArticles(6, 'tech', 100)), { key: ['other'] });
        await flush();

        // still holding their data, and nothing had to refetch them
        expect(c.queryClient.getQueryData(allKey('watched'))).toBeDefined();
        expect(c.queryClient.getQueryData(['resource', 'target', [], '50'])).toBeDefined();
        expect(listCall).toHaveBeenCalledTimes(1);
        watchedList.stop();
        watchedTarget.stop();
    });

    it('a list is still droppable when its key equals a protected record id', async () => {
        const c = makeComposable<IArticle, number>({ maxRecords: 6 });
        const watched = c.watchAll(() => Promise.resolve(buildArticles(3, 'tech', 1)), {
            key: ['watched']
        });
        await flush();
        // an unobserved list whose 4th key segment is '1' — the id of a protected row
        const lookalike = apiResolve(buildArticles(2, 'tech', 200));
        await c.fetchAll(lookalike, { key: ['1'] });

        await c.fetchAll(apiResolve(buildArticles(3, 'tech', 300)), { key: ['other'] });

        expect(c.queryClient.getQueryData(allKey('1'))).toBeUndefined();
        watched.stop();
    });

    it('an in-flight query survives a wipe and lands its answer afterwards', async () => {
        const c = makeComposable<IArticle, number>({ maxRecords: 3 });
        await c.fetchAll(apiResolve(buildArticles(3, 'tech', 1)), { key: ['a'] });
        const slow = deferredApi<IArticle[]>();
        const slowRun = c.fetchAll(slow.call, { key: ['slow'] });
        await flush();

        // 3 cached + 2 new crosses the bound while 'slow' is still fetching
        await c.fetchAll(apiResolve(buildArticles(2, 'tech', 100)), { key: ['b'] });
        const inFlight = c.queryClient.getQueryCache().find({ queryKey: allKey('slow') });
        expect(inFlight?.state.fetchStatus).toBe('fetching');

        slow.control.resolve(buildArticles(1, 'tech', 500));
        await expect(slowRun).resolves.toEqual(buildArticles(1, 'tech', 500));
        expect(c.queryClient.getQueryData(allKey('slow'))).toBeDefined();
    });

    it('leaves the queries of another scope alone, and does not count them', async () => {
        const queryClient = newTestClient();
        const a = makeComposable<IArticle, number>({
            maxRecords: 4,
            dependsOn: () => ['A'],
            queryClient
        });
        const b = makeComposable<IArticle, number>({
            maxRecords: 4,
            dependsOn: () => ['B'],
            queryClient
        });
        await a.fetchAll(apiResolve(buildArticles(3, 'tech', 1)), { key: ['a'] });
        await b.fetchAll(apiResolve(buildArticles(1, 'tech', 100)), { key: ['x'] });

        // B: 1 cached + 2 new = 3 <= 4. Counting A's 3 records as B's would make it 6.
        await b.fetchAll(apiResolve(buildArticles(2, 'tech', 200)), { key: ['y'] });

        expect(b.getRecord(100)).toBeDefined();
        expect(a.getRecord(1)).toBeDefined();
        expect(a.getRecord(3)).toBeDefined();

        // B crossing its own bound wipes B only
        await b.fetchAll(apiResolve(buildArticles(3, 'tech', 300)), { key: ['z'] });
        expect(b.getRecord(100)).toBeUndefined();
        expect(a.getRecord(1)).toBeDefined();
    });

    it.each([0, -1])('maxRecords = %d disables the bound entirely', async (maxRecords) => {
        const c = makeComposable<IArticle, number>({ maxRecords });
        await c.fetchAll(apiResolve(buildArticles(8, 'tech', 1)), { key: ['a'] });
        await c.fetchAll(apiResolve(buildArticles(8, 'tech', 100)), { key: ['b'] });
        expect(c.itemList.value).toHaveLength(16);
        expect(c.queryClient.getQueryData(allKey('a'))).toBeDefined();
    });
});
