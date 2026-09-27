/**
 * Per-record write ordering between reads and mutations of the same resource.
 *
 * A single resource-wide clock, bumped when a mutation on a record starts, plus a per-id "started
 * at" map: a read remembers the clock value when it began, and its write is later dropped if a
 * mutation on that same id started after — or is still running. This lets a read's own answer
 * arrive late without resurrecting a value a newer (or still in-flight) mutation has since moved
 * past, while leaving reads for every other id untouched.
 *
 * @module internal/writeGuard
 */

/** Per-record write ordering (see the module header). */
export interface IWriteGuard<K> {
    /** The clock now. Capture it when a read begins, to test its write against later mutations. */
    readClock: () => number;

    /**
     * Marks a mutation on `id` as started: bumps the clock and records it against `id`.
     *
     * @param id - the record the mutation changes
     * @returns call once the mutation has settled (succeeded, failed, or rolled back)
     */
    beginMutation: (id: K) => () => void;

    /**
     * Whether a read that began at `readAt` may still write `id`.
     *
     * @param id - the record the read would write
     * @param readAt - the clock value the read captured when it began
     * @returns false while a mutation on `id` is pending, or once one started after `readAt`
     */
    canWrite: (id: K, readAt: number) => boolean;
}

/**
 * A write guard for one resource.
 *
 * @returns the guard
 */
export const createWriteGuard = <K>(): IWriteGuard<K> => {
    /** Bumped once per mutation start; a read's `readAt` is a snapshot of this. */
    let clock = 0;

    /** The clock value the most recently started mutation on each id began at. */
    const startedAt = new Map<K, number>();

    /** How many mutations on each id are currently in flight. */
    const pending = new Map<K, number>();

    /**
     * Marks a mutation on `id` as started (see IWriteGuard.beginMutation).
     *
     * @param id - the record the mutation changes
     * @returns settle(), to call once the mutation has settled
     */
    const beginMutation = (id: K): (() => void) => {
        clock += 1;
        startedAt.set(id, clock);
        pending.set(id, (pending.get(id) ?? 0) + 1);
        return () => {
            const remaining = (pending.get(id) ?? 1) - 1;
            if (remaining <= 0) pending.delete(id);
            else pending.set(id, remaining);
        };
    };

    /**
     * Whether a read that began at `readAt` may still write `id` (see IWriteGuard.canWrite).
     *
     * @param id - the record the read would write
     * @param readAt - the clock value the read captured when it began
     * @returns whether the write is still allowed
     */
    const canWrite = (id: K, readAt: number): boolean =>
        !pending.has(id) && (startedAt.get(id) ?? 0) <= readAt;

    return { readClock: () => clock, beginMutation, canWrite };
};
