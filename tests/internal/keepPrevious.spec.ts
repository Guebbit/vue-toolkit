/**
 * UNIT · internal/keepPrevious.ts: the current entry wins; a remembered entry stands in while it
 * is still cached and is skipped once wiped; a scope change or `restart()` retires it; the
 * fallback is the last resort. Driven with plain refs and a Map as the "cache".
 */
import { effectScope, nextTick, ref, shallowRef, type EffectScope } from 'vue';
import { keepPrevious } from '../../src/internal/keepPrevious';

describe('UNIT · keepPrevious', () => {
    let scope: EffectScope;
    let cache: Map<string, string>;
    let version: ReturnType<typeof ref<number>>;
    let key: ReturnType<typeof shallowRef<string[] | undefined>>;
    let dependsOn: ReturnType<typeof ref<string>>;
    let fallback: ReturnType<typeof ref<string | undefined>>;
    let policy: ReturnType<typeof keepPrevious<string>>;

    /** Writes into the fake cache and bumps its version, like a TanStack cache event would. */
    const put = (entryKey: string, value: string) => {
        cache.set(entryKey, value);
        version.value = (version.value ?? 0) + 1;
    };

    /** Removes from the fake cache, as a `maxRecords` wipe would. */
    const wipe = (entryKey: string) => {
        cache.delete(entryKey);
        version.value = (version.value ?? 0) + 1;
    };

    beforeEach(() => {
        cache = new Map();
        version = ref(0);
        key = shallowRef<string[] | undefined>(['a']);
        dependsOn = ref('s1');
        fallback = ref<string | undefined>();
        scope = effectScope();
        policy = scope.run(() =>
            keepPrevious<string>({
                currentKey: () => key.value,
                currentEntry: () => {
                    void version.value;
                    return key.value ? cache.get(key.value[0]!) : undefined;
                },
                fallback: () => fallback.value,
                readEntry: (entryKey) => {
                    void version.value;
                    return cache.get(entryKey[0]!);
                },
                scope: () => dependsOn.value
            })
        )!;
    });

    afterEach(() => scope.stop());

    it('shows the current entry, and is no placeholder', () => {
        put('a', 'A');
        expect(policy.shownEntry.value).toBe('A');
        expect(policy.isPlaceholder.value).toBe(false);
    });

    it('shows nothing before anything was ever shown', () => {
        expect(policy.shownEntry.value).toBeUndefined();
        expect(policy.isPlaceholder.value).toBe(false);
    });

    it('keeps the remembered entry while the next key is not cached', () => {
        put('a', 'A');
        key.value = ['b'];
        expect(policy.shownEntry.value).toBe('A');
        expect(policy.isPlaceholder.value).toBe(true);
        put('b', 'B');
        expect(policy.shownEntry.value).toBe('B');
        expect(policy.isPlaceholder.value).toBe(false);
    });

    it('skips a remembered entry once it left the cache', () => {
        put('a', 'A');
        key.value = ['b'];
        wipe('a');
        expect(policy.shownEntry.value).toBeUndefined();
        expect(policy.isPlaceholder.value).toBe(false);
    });

    it('ignores a remembered entry from another scope', async () => {
        put('a', 'A');
        key.value = ['b'];
        dependsOn.value = 's2';
        await nextTick();
        expect(policy.shownEntry.value).toBeUndefined();
    });

    it('restart() retires the remembered entry even when it is back in the cache', () => {
        put('a', 'A');
        key.value = ['b'];
        policy.restart();
        expect(policy.shownEntry.value).toBeUndefined();
    });

    it('uses the fallback when nothing current or remembered is cached', () => {
        fallback.value = 'F';
        expect(policy.shownEntry.value).toBe('F');
        expect(policy.isPlaceholder.value).toBe(true);
    });

    it('prefers a remembered entry to the fallback', () => {
        put('a', 'A');
        key.value = ['b'];
        fallback.value = 'F';
        expect(policy.shownEntry.value).toBe('A');
    });
});
