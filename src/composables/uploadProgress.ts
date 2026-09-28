/**
 * Upload progress as a single `progress` ref, fed by the HTTP client's progress callback.
 *
 * - Client-agnostic: a caller-supplied builder turns the progress sink into that client's options.
 * - `undefined` = idle, `0..100` = in flight; `track` returns to idle however the request ends.
 *
 * @module composables/uploadProgress
 * @see docs/composables/upload-progress.md
 */
import { computed, ref } from 'vue';
import { promiseTry } from '../internal/promiseTry.js';

/**
 * Sink the request reports its progress to, as a 0–1 fraction (what HTTP clients hand out).
 */
export type TUploadProgressReporter = (fraction: number) => void;

/**
 * Builds your HTTP client's per-call options from the progress sink.
 * Written once per app, and the only client-specific part of this composable.
 */
export type TUploadOptionsBuilder<TOptions> = (onProgress: TUploadProgressReporter) => TOptions;

/**
 * Settings for one {@link useUploadProgress} `track` call.
 */
export interface ITrackUploadSettings {
    /**
     * Whether to track this call at all, default true.
     * Pass `!!file` on a form whose file is optional: a plain field edit sends bytes, and a bar
     * flashing to 100% for it reads as a glitch rather than as feedback.
     */
    enabled?: boolean;
}

/**
 * Progress state for one upload, and the wrapper that drives it.
 *
 * @param buildOptions - see {@link TUploadOptionsBuilder}
 * @returns `progress`, `isUploading`, plus `report`, `reset` and `track`
 */
export const useUploadProgress = <TOptions>(buildOptions: TUploadOptionsBuilder<TOptions>) => {
    /**
     * Percentage sent (0–100), or undefined while idle.
     * The two are different states: undefined is "nothing is uploading", 0 is "started, nothing
     * sent yet". Show the bar for the second, hide it for the first.
     */
    const progress = ref<number>();

    /**
     * Whether an upload is currently being tracked.
     */
    const isUploading = computed(() => progress.value !== undefined);

    /**
     * Identifies the most recent `track` call. Every call captures its own value at start;
     * a report or reset from a call whose value no longer matches this one is stale — a
     * superseded upload settling (or still reporting) after a newer one started — and is
     * dropped instead of clobbering the bar the newer call owns.
     */
    let currentTrackToken = 0;

    /**
     * Records progress from a 0–1 fraction.
     * Clamped: a client reporting `loaded` against a stale total can exceed 1, and a bar rendered
     * at `width: 137%` breaks the layout.
     *
     * @param fraction - share of the payload sent, nominally 0–1
     */
    const report: TUploadProgressReporter = (fraction) => {
        progress.value = Math.min(Math.max(fraction, 0), 1) * 100;
    };

    /**
     * Returns to idle.
     */
    const reset = () => {
        progress.value = undefined;
    };

    /**
     * Runs a request with progress tracking attached, returning to idle however it ends.
     *
     * @param send     - performs the call, receiving the built options (undefined when untracked)
     * @param settings - see {@link ITrackUploadSettings}
     * @returns whatever `send` produced, untouched — a rejection stays a rejection
     */
    const track = <T>(
        send: (options?: TOptions) => Promise<T>,
        { enabled = true }: ITrackUploadSettings = {}
    ): Promise<T> => {
        // promiseTry: a SYNCHRONOUS throw from send (not just a rejection) still reaches the
        // caller as a rejected promise instead of escaping this call frame.
        if (!enabled) return promiseTry(() => send());

        // This call's own identity: two overlapping track() calls must not let the first to
        // settle (or report) clobber the bar the other still owns.
        // Stryker disable next-line UpdateOperator: a generation token — only the change matters, not the direction.
        const token = ++currentTrackToken;

        // 0 from the moment the request is in flight: a bar that waits for the first progress
        // event never appears at all on a fast connection.
        progress.value = 0;

        // promiseTry also covers buildOptions: a throwing builder must still return to idle
        // through the `finally` below, not skip it.
        return promiseTry(() =>
            send(
                buildOptions((fraction) => {
                    if (token === currentTrackToken) report(fraction);
                })
            )
        ).finally(() => {
            if (token === currentTrackToken) reset();
        });
    };

    return {
        progress,
        isUploading,
        report,
        reset,
        track
    };
};

/**
 * Everything {@link useUploadProgress} returns.
 */
export type IUploadProgress<TOptions> = ReturnType<typeof useUploadProgress<TOptions>>;
