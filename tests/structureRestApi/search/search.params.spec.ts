/**
 * SEARCH — filter parameters as the cache dimension.
 *
 * Each distinct set of filters is its own cache bucket; equal filters (regardless
 * of key order) share one. Covers flat string/number/boolean filters and
 * array-of-primitive filters (both serialise stably via searchKeyGen).
 *
 * NOTE: searchKeyGen allow-lists only TOP-LEVEL keys, so nested-object filter
 * *content* is intentionally not used as a distinguishing dimension here.
 */

import { makeComposable, clearAllInstances } from '../_helpers/harness';
import { apiResolve } from '../_helpers/fakeApi';
import { buildArticles, type IArticle } from '../_helpers/fixtures';

afterEach(clearAllInstances);

const make = () => makeComposable<IArticle, number>();
const TECH = buildArticles(5, 'tech', 1);
const SPORT = buildArticles(3, 'sport', 100);

describe('SEARCH · filter parameters', () => {
    it('equal filters in different key order hit the same bucket', async () => {
        const c = make();
        const first = apiResolve(TECH);
        const second = apiResolve(TECH);
        await c.fetchSearch(first, { category: 'tech', status: 'active' }, 1);
        await c.fetchSearch(second, { status: 'active', category: 'tech' }, 1);
        expect(second).not.toHaveBeenCalled();
    });

    it('different filter VALUES are separate buckets', async () => {
        const c = make();
        const techCall = apiResolve(TECH);
        const sportCall = apiResolve(SPORT);
        await c.fetchSearch(techCall, { category: 'tech' }, 1);
        await c.fetchSearch(sportCall, { category: 'sport' }, 1);
        expect(techCall).toHaveBeenCalledTimes(1);
        expect(sportCall).toHaveBeenCalledTimes(1);
    });

    it('different filter PROPERTIES are separate buckets', async () => {
        const c = make();
        const a = apiResolve(TECH);
        const b = apiResolve(TECH);
        await c.fetchSearch(a, { category: 'tech' }, 1);
        await c.fetchSearch(b, { tag: 'tech' }, 1);
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);
    });

    it('boolean filter values distinguish buckets', async () => {
        const c = make();
        const on = apiResolve(TECH);
        const off = apiResolve(TECH);
        await c.fetchSearch(on, { published: true }, 1);
        await c.fetchSearch(off, { published: false }, 1);
        expect(on).toHaveBeenCalledTimes(1);
        expect(off).toHaveBeenCalledTimes(1);
    });

    it('numeric filter values distinguish buckets', async () => {
        const c = make();
        const y2023 = apiResolve(TECH);
        const y2024 = apiResolve(TECH);
        await c.fetchSearch(y2023, { year: 2023 }, 1);
        await c.fetchSearch(y2024, { year: 2024 }, 1);
        expect(y2023).toHaveBeenCalledTimes(1);
        expect(y2024).toHaveBeenCalledTimes(1);
    });

    it('array-of-primitive filter values distinguish buckets', async () => {
        const c = make();
        const xy = apiResolve(TECH);
        const xz = apiResolve(TECH);
        await c.fetchSearch(xy, { tags: ['x', 'y'] }, 1);
        await c.fetchSearch(xz, { tags: ['x', 'z'] }, 1);
        expect(xy).toHaveBeenCalledTimes(1);
        expect(xz).toHaveBeenCalledTimes(1);
    });

    it('empty filters are their own bucket, distinct from any filtered search', async () => {
        const c = make();
        const all = apiResolve(TECH);
        const filtered = apiResolve(TECH);
        await c.fetchSearch(all, {}, 1);
        await c.fetchSearch(filtered, { category: 'tech' }, 1);
        expect(all).toHaveBeenCalledTimes(1);
        expect(filtered).toHaveBeenCalledTimes(1);
    });

    it('searchGet returns the stored results for a filtered search', async () => {
        const c = make();
        await c.fetchSearch(apiResolve(TECH), { category: 'tech' }, 1);
        expect(c.searchGet({ category: 'tech' }, 1).map((a) => a.id)).toEqual(TECH.map((a) => a.id));
    });
});
