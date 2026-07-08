/**
 * INTENTION — a realistic search-as-you-type journey against a fake server,
 * with a fake clock, where the SAME query is sometimes a cache hit and sometimes
 * stale. We assert the exact number of server search round-trips at each step —
 * the whole point of the cache is that it collapses redundant identical queries
 * while still honouring the stale window.
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { createServer } from '../_helpers/fakeServer';
import { buildArticles, type IArticle } from '../_helpers/fixtures';
import { useFakeClock, advance, restoreClock } from '../_helpers/time';

const TTL = 10_000;
const TECH = buildArticles(8, 'tech', 1);
const SPORT = buildArticles(4, 'sport', 100);
const isTech = (a: IArticle) => a.category === 'tech';
const isSport = (a: IArticle) => a.category === 'sport';

beforeEach(() => useFakeClock());
afterEach(() => {
    clearAllInstances();
    restoreClock();
});

describe('INTENTION · search journey', () => {
    it('collapses repeated queries but refetches once stale', async () => {
        const server = createServer<IArticle>([...TECH, ...SPORT]);
        const c = makeComposable<IArticle, number>({ TTL });

        // types "t" → tech page 1
        await c.fetchSearch(server.search(isTech, 1, 10), { q: 't' }, 1, 10);
        expect(server.calls.search).toBe(1);
        expect(c.searchGet({ q: 't' }, 1, 10)).toHaveLength(8);
        expect(c.searchGetTotal({ q: 't' }, 10)).toBe(8);

        // refines to "te" → new cache key → new call
        await c.fetchSearch(server.search(isTech, 1, 10), { q: 'te' }, 1, 10);
        expect(server.calls.search).toBe(2);

        // deletes back to "t" shortly after → still fresh → cache hit
        await advance(2000);
        await c.fetchSearch(server.search(isTech, 1, 10), { q: 't' }, 1, 10);
        expect(server.calls.search).toBe(2);

        // scrolls to page 2 of "t" → different page → new call
        await c.fetchSearch(server.search(isTech, 2, 10), { q: 't' }, 2, 10);
        expect(server.calls.search).toBe(3);

        // switches to a sport query → new call
        await c.fetchSearch(server.search(isSport, 1, 10), { q: 's' }, 1, 10);
        expect(server.calls.search).toBe(4);
        expect(c.searchGet({ q: 's' }, 1, 10)).toHaveLength(4);

        // lets "t" page 1 go stale, then re-runs it → refetch
        await advance(TTL + 1);
        await c.fetchSearch(server.search(isTech, 1, 10), { q: 't' }, 1, 10);
        expect(server.calls.search).toBe(5);

        // immediately repeating it is fresh again → no call
        await c.fetchSearch(server.search(isTech, 1, 10), { q: 't' }, 1, 10);
        expect(server.calls.search).toBe(5);
    });

    it('keeps every distinct (query, page, pageSize) result independently retrievable', async () => {
        const server = createServer<IArticle>([...TECH, ...SPORT]);
        const c = makeComposable<IArticle, number>({ TTL });

        await c.fetchSearch(server.search(isTech, 1, 5), { q: 't' }, 1, 5);
        await c.fetchSearch(server.search(isTech, 2, 5), { q: 't' }, 2, 5);
        await c.fetchSearch(server.search(isSport, 1, 5), { q: 's' }, 1, 5);

        expect(c.searchGet({ q: 't' }, 1, 5).map((a) => a.id)).toEqual([1, 2, 3, 4, 5]);
        expect(c.searchGet({ q: 't' }, 2, 5).map((a) => a.id)).toEqual([6, 7, 8]);
        expect(c.searchGet({ q: 's' }, 1, 5).map((a) => a.id)).toEqual([100, 101, 102, 103]);
    });
});
