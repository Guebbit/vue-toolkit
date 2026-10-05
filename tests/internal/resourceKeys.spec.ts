/**
 * UNIT · internal/resourceKeys.ts accessors and internal/liveScope.ts: the key layout is read
 * only through these, and a late write runs only while its scope is still claimed.
 */
import {
    createResourceKeys,
    idOf,
    kindOf,
    partsOf,
    resourceOf
} from '../../src/internal/resourceKeys';
import { createInLiveScope } from '../../src/internal/liveScope';

describe('UNIT · cache-key accessors', () => {
    const keys = createResourceKeys('items', () => ['s']);

    it('reads resource, kind and id segments of a target key', () => {
        const key = keys.target(7);
        expect(resourceOf(key)).toBe('items');
        expect(kindOf(key)).toBe('target');
        expect(idOf(key)).toBe('7');
    });

    it('partsOf returns exactly `count` identity segments, leaving the caller key out', () => {
        const key = keys.entry('search', ['s'], ['f', 10, 2], ['extra']);
        expect(partsOf(key, 3)).toEqual(['f', 10, 2]);
        expect(partsOf(key, 1)).toEqual(['f']);
        expect(partsOf(key, 0)).toEqual([]);
    });
});

describe('UNIT · createInLiveScope', () => {
    const forScope = jest.fn(<R>(_scope: unknown[], run: () => R) => run());
    const inLiveScope = (live: boolean) =>
        createInLiveScope({ forScope }, { claim: jest.fn(), isLive: () => live });

    afterEach(() => forScope.mockClear());

    it('runs the write under the scope while it is claimed', () => {
        expect(inLiveScope(true)(['a'], () => 'done', 'fallback')).toBe('done');
        expect(forScope).toHaveBeenCalledWith(['a'], expect.any(Function));
    });

    it('returns the fallback, running nothing, once nothing claims the scope', () => {
        const run = jest.fn();
        expect(inLiveScope(false)(['a'], run, 'fallback')).toBe('fallback');
        expect(run).not.toHaveBeenCalled();
    });
});
