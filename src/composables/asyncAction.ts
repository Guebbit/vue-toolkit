/**
 * One async call wrapped in `data` / `error` / `loading` refs.
 *
 * - "Latest run wins": a sequence counter guards every write, so an overtaken response is dropped.
 * - Never rejects: a failure resolves into `error`, which suits READS (one dead panel, not a
 *   blank page). Writes the user is owed an answer for should reject instead.
 *
 * @module composables/asyncAction
 * @see docs/composables/async-action.md
 */
import { ref, shallowRef, type Ref } from 'vue';
import { extractErrorMessage } from '@guebbit/js-toolkit';
import { promiseTry } from '../internal/promiseTry.js';

/**
 * What an overtaken run resolves with.
 *
 * Named so the reason survives: a run that a newer one has passed may neither write state nor
 * answer on its successor's behalf, and returning its own payload would be exactly that.
 */
const OVERTAKEN = undefined;

/**
 * Turns a rejected value into the message to display.
 *
 * Defaults to `extractErrorMessage` from `@guebbit/js-toolkit`. Pass your own for an app-wide
 * rule, e.g. an i18n'd "something went wrong" when the rejection carried nothing readable.
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
 * For one-shot payloads, not records: the `useStructure*` family covers identified, cached,
 * mutated data.
 *
 * Never rejects — a failure lands in `error` and the promise still resolves.
 *
 * @param action   - performs the call; its arguments become `run`'s arguments
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
    /**
     * Payload of the latest successful run, or `initialData`.
     *
     * Vue: `shallowRef` because the payload is replaced whole, never mutated in place, so no deep
     * proxy is needed. The cast widens `ShallowRef` back to the plain `Ref` consumers expect.
     */
    const data = shallowRef<T | undefined>(initialData) as Ref<T | undefined>;

    /**
     * Display message of the latest failed run; cleared when a new run starts.
     */
    const error = ref<string>();

    /**
     * Whether the newest run is still in flight.
     */
    const loading = ref(false);

    /**
     * Sequence number of the most recent `run`.
     *
     * Guards against out-of-order responses: a slow first request resolving after a fast second
     * one would overwrite fresh data with stale. Only the newest run may write.
     */
    let latest = 0;

    /**
     * Runs the action, recording its outcome.
     *
     * @param parameters - forwarded to `action`
     * @returns a promise resolving with the payload, or `undefined` when the call failed or was
     *          overtaken by a newer run
     */
    const run = (...parameters: TArguments): Promise<T | undefined> => {
        const current = ++latest;
        loading.value = true;
        error.value = undefined;

        // promiseTry: a synchronous throw from `action` (before it returns a promise) rejects
        // like any other failure instead of escaping this call.
        return promiseTry(() => action(...parameters))
            .then((result): T | undefined => {
                if (current !== latest) return OVERTAKEN;
                data.value = result;
                return result;
            })
            .catch((error_: unknown): undefined => {
                // A failure answers undefined; only the newest run records it.
                if (current === latest) error.value = resolveError(error_, fallbackErrorMessage);
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
        // Bumped so a run still in flight cannot write to the state just cleared
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
