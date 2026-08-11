import { computed, ref } from 'vue';

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
 * @param buildOptions - See {@link TUploadOptionsBuilder}
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
     * Record progress from a 0–1 fraction.
     * Clamped: a client reporting `loaded` against a stale total can exceed 1, and a bar rendered
     * from `width: 137%` breaks the layout rather than merely looking wrong.
     *
     * @param fraction
     */
    const report: TUploadProgressReporter = (fraction) => {
        progress.value = Math.min(Math.max(fraction, 0), 1) * 100;
    };

    /**
     * Return to idle.
     */
    const reset = () => {
        progress.value = undefined;
    };

    /**
     * Run a request with progress tracking attached, returning to idle however it ends.
     *
     * @param send     - performs the call, receiving the built options (undefined when untracked)
     * @param settings - see {@link ITrackUploadSettings}
     * @returns whatever `send` produced, untouched — a rejection stays a rejection
     */
    const track = <T>(
        send: (options?: TOptions) => Promise<T>,
        { enabled = true }: ITrackUploadSettings = {}
    ): Promise<T> => {
        if (!enabled) return send();

        // 0 from the moment the request is in flight: a bar that waits for the first progress
        // event never appears at all on a fast connection.
        progress.value = 0;

        // `finally` forwards the value and re-throws the rejection untouched
        return send(buildOptions(report)).finally(reset);
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
