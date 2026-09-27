/**
 * A `down` flag for something the app depends on, fed by a caller-supplied probe.
 *
 * - Probes on creation, on every browser `online` event, and on a slow retry loop only while down.
 * - Exactly ONE retry timer exists at a time: every scheduling cancels the previous one first.
 * - "Latest probe wins": a sequence counter drops answers from overtaken probes.
 * - Stops with the surrounding Vue effect scope, or by calling `stop()`.
 *
 * @module composables/livenessProbe
 * @see docs/composables/liveness-probe.md
 */
import { getCurrentScope, onScopeDispose, ref } from 'vue';

/**
 * Settings for {@link useLivenessProbe}.
 */
export interface ILivenessProbeSettings {
    /**
     * Milliseconds between retries WHILE down, default 30 000.
     *
     * Only used after a failure: a reachable target is not polled again.
     * This drives a banner, not a monitor, so a slow interval is the point.
     */
    retryDelay?: number;

    /**
     * Whether to probe as soon as the composable is created, default true.
     */
    immediate?: boolean;

    /**
     * What to listen to for the `online` event, default `globalThis`.
     *
     * `online` is the one moment a re-probe is certain to be worth making, and the only DOM this
     * composable touches. Pass your own `EventTarget` to drive it from another signal, or to test
     * the wiring without a DOM.
     */
    target?: EventTarget;
}

/**
 * Watches whether something the app depends on is still answering.
 *
 * One probe on creation, one on every browser `online` event, and a slow retry loop only while
 * down. What it probes is the caller's business: a liveness endpoint, a socket handshake, a `HEAD`
 * against a CDN — anything that rejects when unreachable.
 *
 * Auto-stops with the surrounding effect scope (a component, a Pinia setup store, a bare
 * `effectScope`); created outside one, it is the caller's to `stop()`.
 *
 * @param probe    - performs one check; resolve when reachable, reject when not. The resolved
 *                   value is ignored, so any call can be handed over as-is.
 * @param settings - see {@link ILivenessProbeSettings}
 * @returns `down` — true while the last probe failed — plus `check` to probe now and `stop`
 */
export const useLivenessProbe = (
    probe: () => Promise<unknown>,
    { retryDelay = 30_000, immediate = true, target }: ILivenessProbeSettings = {}
) => {
    /**
     * What the `online` listener is attached to.
     *
     * `globalThis` is an EventTarget in a browser but not under SSR or a node test runner, so the
     * capability is checked. Without a target the probe never re-runs on its own — correct where
     * there is no connectivity event.
     */
    const _eventTarget: EventTarget | undefined =
        target ?? (typeof globalThis.addEventListener === 'function' ? globalThis : undefined);

    /**
     * Whether the last probe failed. The whole point of the composable.
     */
    const down = ref(false);

    /**
     * The one pending retry, if any.
     *
     * ONE, singular: the invariant this composable exists to hold. Every scheduling goes through
     * `_cancelRetry` first, so an `online` event mid-loop replaces the chain instead of forking
     * it, and teardown always has exactly one timer to clear.
     */
    let _retryTimer: ReturnType<typeof setTimeout> | undefined;

    /**
     * Sequence number of the most recent `check`.
     *
     * A probe in flight when a second one starts can still resolve after it. Without this, a slow
     * failing probe could overwrite the fresh "back up" answer and leave the banner showing.
     */
    let _latest = 0;

    /**
     * Cancels the pending retry, if any.
     */
    const _cancelRetry = (): void => {
        if (_retryTimer) clearTimeout(_retryTimer);
        _retryTimer = undefined;
    };

    /**
     * Probes now, cancelling any pending retry first.
     *
     * @returns a promise resolving once `down` reflects the outcome. Never rejects — an
     *          unreachable target is the state this reports, not a failure of the report.
     */
    const check = (): Promise<void> => {
        _cancelRetry();
        const current = ++_latest;

        return probe()
            .then(() => {
                // An overtaken probe may not write: its answer is older than the one on screen
                if (current !== _latest) return;
                down.value = false;
            })
            .catch(() => {
                if (current !== _latest) return;
                down.value = true;
                // Retry only while down — a reachable target is not polled again
                _retryTimer = setTimeout(() => void check(), retryDelay);
            });
    };

    /**
     * Re-probes on the browser's `online` event.
     *
     * Fire-and-forget by design: `check` never rejects, and nothing is waiting on this one.
     */
    const _handleOnline = (): void => void check();

    /**
     * Tears down this composable: stops the retry chain and unsubscribes. Idempotent.
     *
     * Auto-wired to the current Vue effect scope below; without one, call it yourself.
     */
    const stop = (): void => {
        // Bumped so a probe still in flight cannot write to `down` after teardown
        _latest++;
        _cancelRetry();
        _eventTarget?.removeEventListener('online', _handleOnline);
    };

    _eventTarget?.addEventListener('online', _handleOnline);

    // Vue: run `stop` when the owning scope (component, setup store, effectScope) is disposed.
    // No active scope = standalone usage; registering would only emit a warning.
    if (getCurrentScope()) onScopeDispose(stop);

    // First probe, unless the caller wants to choose the moment themselves
    if (immediate) void check();

    return {
        // state
        down,

        // probes
        check,
        stop
    };
};

/**
 * Everything {@link useLivenessProbe} returns.
 */
export type ILivenessProbe = ReturnType<typeof useLivenessProbe>;
