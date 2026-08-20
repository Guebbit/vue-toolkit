import { ref, shallowRef, type Ref } from 'vue';
import { extractErrorMessage } from '@guebbit/js-toolkit';

/**
 * What an overtaken run resolves with.
 *
 * Named rather than written inline so the reason survives: a run that a newer one has passed may
 * neither write state nor answer on its successor's behalf, and returning its own payload would
 * be exactly that.
 */
const OVERTAKEN = undefined;

/**
 * Turns a rejected value into the message to display.
 *
 * Defaults to `extractErrorMessage` from `@guebbit/js-toolkit`. Pass your own to apply an
 * app-wide rule — an i18n'd "something went wrong" when the rejection carried nothing, say, which
 * the toolkit cannot supply without taking a position on your locale.
 */
export type TErrorResolver = (error: unknown, fallback?: string) => string;

/**
 * Settings for {@link useAsyncAction}.
 */
export interface IAsyncActionSettings<T> {
    /** Value of `data` before the first successful run, and after `reset()`. */
    initialData?: T;
    /**
     * Message stored in `error` when the rejection carries nothing readable at all. Already
     * translated by the caller — this composable does no i18n of its own.
     */
    fallbackErrorMessage?: string;
    /** See {@link TErrorResolver}. */
    resolveError?: TErrorResolver;
}

/**
 * Loading/data/error state for one async call, and the wrapper that drives it.
 *
 * The opposite case to the `useStructure*` family: those are about *records* — identified, cached,
 * mutated — and this is a one-shot call whose answer is just a payload. `fetchAny` covers the
 * loading half but exposes neither `data` nor `error`, which is what leaves a dashboard writing
 * the same three-ref block once per endpoint.
 *
 * Never rejects. A failure lands in `error` and the promise still resolves, so one dead endpoint
 * leaves the other panels rendered instead of blanking the page. That makes it a composable for
 * READS. A write whose outcome the user asked for and is owed either way should reject and let
 * the view answer, rather than have the view poll an error ref after the fact.
 *
 * @param action   - performs the call
 * @param settings - see {@link IAsyncActionSettings}
 * @returns `data`, `error`, `loading`, plus `run` and `reset`
 */
export const useAsyncAction = <T, TArguments extends unknown[] = []>(
    action: (...parameters: TArguments) => Promise<T>,
    {
        initialData,
        fallbackErrorMessage,
        resolveError = extractErrorMessage
    }: IAsyncActionSettings<T> = {}
) => {
    const data = shallowRef<T | undefined>(initialData) as Ref<T | undefined>;
    const error = ref<string>();
    const loading = ref(false);

    /**
     * Sequence number of the most recent `run`.
     *
     * Guards against out-of-order responses: click Refresh twice and a slow first request can
     * resolve after a fast second one, overwriting fresh data with stale. Only the newest run is
     * allowed to write.
     */
    let latest = 0;

    /**
     * Runs the action, recording its outcome.
     *
     * @param parameters - forwarded to `action`
     * @returns a promise resolving with the payload, or `undefined` when the call failed
     */
    const run = (...parameters: TArguments): Promise<T | undefined> => {
        const current = ++latest;
        loading.value = true;
        error.value = undefined;

        return action(...parameters)
            .then((result): T | undefined => {
                if (current !== latest) return OVERTAKEN;
                data.value = result;
                return result;
            })
            .catch((error_: unknown): undefined => {
                if (current !== latest) return OVERTAKEN;
                error.value = resolveError(error_, fallbackErrorMessage);
                return OVERTAKEN;
            })
            .finally(() => {
                // Only the newest run owns the flag, or an overtaken call would clear it while
                // its successor is still in flight.
                if (current === latest) loading.value = false;
            });
    };

    /**
     * Returns to the pre-run state.
     */
    const reset = () => {
        // Bumped so a run still in flight can no longer write to the state it just cleared
        latest++;
        data.value = initialData;
        error.value = undefined;
        loading.value = false;
    };

    return { data, error, loading, run, reset };
};

/**
 * Everything {@link useAsyncAction} returns.
 */
export type IAsyncAction<T, TArguments extends unknown[] = []> = ReturnType<
    typeof useAsyncAction<T, TArguments>
>;
