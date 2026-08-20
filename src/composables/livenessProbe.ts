import { getCurrentScope, onScopeDispose, ref } from 'vue';

/**
 * Composable customization settings
 */
export interface ILivenessProbeSettings {
    /**
     * Milliseconds between retries WHILE down, default 30 000.
     *
     * Only ever used after a failure: a reachable target is never polled twice. This is a banner,
     * not a monitor — a probe every few seconds costs a request per user per interval forever and
     * tells nobody anything they did not already know.
     */
    retryDelay?: number;

    /**
     * Whether to probe as soon as the composable is created, default true.
     */
    immediate?: boolean;

    /**
     * What to listen to for the `online` event, default `globalThis`.
     *
     * The browser firing `online` is the one moment a re-probe is certain to be worth making, and
     * it is also the only DOM this composable touches. Pass an `EventTarget` of your own to drive
     * it from a different signal — or to assert the wiring in a test runner with no DOM at all.
     */
    target?: EventTarget;
}

/**
 * Watches whether something the app depends on is still answering.
 *
 * One probe on creation, one on every browser `online` event, and a slow retry loop only while
 * down. What it is probing is the caller's business: a liveness endpoint, a socket handshake, a
 * `HEAD` against a CDN. Anything that rejects when unreachable will do.
 *
 * None of the three decisions are hard and all are easy to get subtly wrong. The retry chain is
 * the one that bites: without a single owner, a second `online` event while down starts a second
 * permanent loop, and every one after that another, with teardown able to stop only the last.
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
     * `globalThis` is an EventTarget in a browser and not one under SSR or a node test runner, so
     * the capability is checked rather than assumed. Without a target the probe simply never
     * re-runs on its own, which is the right behaviour where there is no connectivity event.
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
     * ONE, singular: it is the invariant this composable exists to hold. Every scheduling goes
     * through `_cancelRetry` first, so an `online` event arriving mid-loop replaces the chain
     * instead of forking it, and teardown always has exactly one timer to clear.
     */
    let _retryTimer: ReturnType<typeof setTimeout> | undefined;

    /**
     * Sequence number of the most recent `check`.
     *
     * A probe already in flight when a second one starts can still resolve after it. Without this
     * an `online` event that finds the target back up can be overwritten a moment later by the
     * slow failing probe it interrupted, leaving the banner up over a working connection.
     */
    let _latest = 0;

    /**
     * Cancels the pending retry, if any.
     *
     * Called before every scheduling and on teardown, because there is exactly ONE retry chain.
     */
    const _cancelRetry = (): void => {
        if (_retryTimer) clearTimeout(_retryTimer);
        _retryTimer = undefined;
    };

    /**
     * Probes now, cancelling any pending retry first.
     *
     * @returns a promise resolving once `down` reflects the outcome. Never rejects — an
     *  unreachable target is the state this reports, not a failure of the report.
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
                // Retry only while down — a reachable target is never polled twice
                _retryTimer = setTimeout(() => void check(), retryDelay);
            });
    };

    /**
     * Re-probes on the browser's `online` event.
     *
     * Fire-and-forget by design: `check` never rejects, and nothing is waiting on this one.
     */
    const _handleOnline = (): void => void check();
    _eventTarget?.addEventListener('online', _handleOnline);

    /**
     * Tear down this composable: stop the retry chain and unsubscribe. Idempotent.
     *
     * Auto-wired to the current Vue effect scope (component `setup`, Pinia setup store,
     * `effectScope`) so it runs on teardown for free. When there is no active scope
     * (plain/standalone usage) nothing is registered and no warning is emitted; call `stop()`
     * yourself in that case.
     */
    const stop = (): void => {
        // Bumped so a probe still in flight can no longer write to `down` after teardown
        _latest++;
        _cancelRetry();
        _eventTarget?.removeEventListener('online', _handleOnline);
    };
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
