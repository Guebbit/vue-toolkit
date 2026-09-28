/**
 * The `useQuery` options a caller may set through `queryOptions`, and nothing else.
 *
 * A whitelist, not a pass-through: a caller's object can carry more than its type says (a JS
 * caller, a widened object), and an engine-owned option such as `gcTime` or `select` slipping into
 * `useQuery` would break the cache layout every read relies on. The key list is typed against
 * `ITanStackQueryOptions` itself, so adding an option there fails the build until it is listed.
 *
 * @module internal/tanstackQueryOptions
 */
import type { ITanStackQueryOptions } from '../composables/structureRestApi.js';

/** Every `ITanStackQueryOptions` key; a `Record` so the compiler checks none is missing. */
// Stryker disable all: the values are type-only; the lookup reads keys, never values.
const ALLOWED_KEYS: Record<keyof ITanStackQueryOptions, true> = {
    retry: true,
    retryDelay: true,
    refetchInterval: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true
};
// Stryker restore all

/**
 * The documented options of `options`, and only those. A key the caller set to `undefined` is
 * kept, so it still overrides a resource-level default the way a spread would.
 *
 * @param options - caller-supplied `queryOptions`, possibly carrying more than its type says
 * @returns a copy holding the allowed keys it sets
 */
export const pickQueryOptions = (options: ITanStackQueryOptions = {}): ITanStackQueryOptions =>
    Object.fromEntries(
        Object.entries(options).filter(([key]) => Object.hasOwn(ALLOWED_KEYS, key))
    ) as ITanStackQueryOptions;
