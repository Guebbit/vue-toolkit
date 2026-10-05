/**
 * "Keep the last shown entry on screen while the next one loads" (the idea behind TanStack's
 * `keepPreviousData`), as a policy over plain getters: no search or cache types in here.
 *
 * ```mermaid
 * flowchart LR
 *     C[currentEntry] -->|cached| S[shownEntry]
 *     R[remembered key, same scope tag] -->|readEntry: still cached| S
 *     F[fallback] --> S
 * ```
 *
 * The key of the last entry actually shown is remembered eagerly, tagged with the scope it was
 * shown under plus a reset generation. A scope change or `restart()` changes the tag, so a
 * remembered key from before is ignored instead of leaking old rows onto a new scope. The entry
 * itself is re-read through `readEntry` (not remembered), so a cache wipe is never shown again.
 *
 * @module internal/keepPrevious
 * @see docs/composables/structure-search-api.md
 */
import { computed, ref, shallowRef, watch, type ComputedRef } from 'vue';
import { stableKey } from './plainData.js';

/** What the policy reads. */
export interface IKeepPreviousSources<E> {
    /** The key of the entry that should be shown now; undefined when there is none. */
    currentKey: () => unknown[] | undefined;

    /** The entry under `currentKey`, when cached. */
    currentEntry: () => E | undefined;

    /** Last resort when nothing current or remembered is cached. */
    fallback: () => E | undefined;

    /** Reads an entry by key. Must read the cache's reactive version, so the result stays tracked. */
    readEntry: (key: unknown[]) => E | undefined;

    /** The scope a shown entry belongs to (`dependsOn`). */
    scope: () => unknown;
}

/** What the policy exposes. */
export interface IKeepPrevious<E> {
    /** The entry to show: the current one, else the remembered one, else the fallback. */
    shownEntry: ComputedRef<E | undefined>;

    /** True while `shownEntry` is something other than the current entry. */
    isPlaceholder: ComputedRef<boolean>;

    /** Forgets every remembered key: call it when the cache is wiped on the SAME scope. */
    restart: () => void;
}

/**
 * Builds the keep-previous policy. Call it synchronously inside the owner's effect scope: it
 * creates a watcher.
 *
 * @param sources - see IKeepPreviousSources
 * @returns shownEntry, isPlaceholder and restart
 */
export const keepPrevious = <E>({
    currentKey,
    currentEntry,
    fallback,
    readEntry,
    scope
}: IKeepPreviousSources<E>): IKeepPrevious<E> => {
    /** Bumped by `restart()`, so a wipe on the same scope also retires the remembered key. */
    const generation = ref(0);

    /** The tag a shown entry carries: scope plus generation, folded into one string. */
    const tag = (): string => stableKey([scope(), generation.value]);

    /** The key of the last current entry seen, with the tag it was seen under. */
    const lastShown = shallowRef<{ tag: string; key: unknown[] }>();

    // Vue: `sync` flush updates the memory in the same tick the entry changes, so a read right
    // after a key change sees the same thing a next-render read would. `immediate` seeds it.
    watch(
        () => currentEntry(),
        (entry) => {
            if (entry) lastShown.value = { tag: tag(), key: currentKey()! };
        },
        { immediate: true, flush: 'sync' }
    );

    /** The entry to show now. */
    const shownEntry = computed<E | undefined>(() => {
        const remembered =
            lastShown.value?.tag === tag() ? readEntry(lastShown.value.key) : undefined;
        return currentEntry() ?? remembered ?? fallback();
    });

    /** Whether the shown entry is a stand-in for the current one. */
    const isPlaceholder = computed<boolean>(
        () => currentEntry() === undefined && shownEntry.value !== undefined
    );

    /** Retires every remembered key. */
    const restart = (): void => {
        // Stryker disable next-line UpdateOperator: a generation token — only the change matters, not the direction.
        generation.value++;
    };

    return { shownEntry, isPlaceholder, restart };
};
