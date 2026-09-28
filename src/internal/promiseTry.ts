/**
 * Runs `fn` immediately, inside a `Promise` executor, so a SYNCHRONOUS throw becomes a rejection
 * instead of escaping the caller's call frame. Same contract as ES2025 `Promise.try`.
 *
 * Node's `engines` floor (20) predates `Promise.try` — swap to the native one once the floor
 * allows it.
 *
 * @module internal/promiseTry
 */

/**
 * @param function_ - called synchronously; its return value (or throw) settles the returned promise
 */
export const promiseTry = <T>(function_: () => T | Promise<T>): Promise<T> =>
    new Promise<T>((resolve) => resolve(function_()));
