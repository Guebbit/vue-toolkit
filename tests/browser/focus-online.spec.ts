/**
 * @jest-environment jsdom
 *
 * BROWSER — refetch on window focus / on reconnect. Both are TanStack's OWN defaults
 * (`refetchOnWindowFocus`, `refetchOnReconnect`): the toolkit configures neither, so this pins
 * that default deliberately rather than assuming it.
 *
 * It takes `VueQueryPlugin` — `runInjected` below — to see either one: `client.mount()`, which
 * `VueQueryPlugin` calls unless `environmentManager.isServer()`, is what subscribes the CLIENT to
 * `focusManager`/`onlineManager` and refetches every active, stale query when they fire. Under
 * Jest's default Node environment there is no `window`, `isServer()` is true, and the plugin skips
 * `mount()` entirely — this contract is untestable there regardless of how focus/online are
 * simulated. `focusManager.setFocused`/`onlineManager.setOnline` (TanStack's own testing hooks)
 * drive the transition directly, with no real DOM event needed.
 *
 * `newTestClient()` (see `_helpers/harness.ts`) sets `networkMode: 'always'`, which makes a query
 * ignore online/offline entirely — the opposite of what the reconnect half of this suite needs —
 * so this file builds its own client with TanStack's default `networkMode: 'online'`.
 */
import { QueryClient, focusManager, onlineManager } from '@tanstack/vue-query';
import { useStructureRestApi } from '../../src/composables/structureRestApi';
import { runInjected, clearAllInstances, flush } from '../structureRestApi/_helpers/harness';
import { USERS, type IUser } from '../structureRestApi/_helpers/fixtures';

/** retry: false only — networkMode stays TanStack's own default ('online'), unlike newTestClient(). */
const browserClient = (): QueryClient =>
    new QueryClient({ defaultOptions: { queries: { retry: false } } });

const make = (staleTime: number) => {
    const queryClient = browserClient();
    return runInjected(queryClient, () =>
        useStructureRestApi<IUser, number>({ resourceKey: 'resource', staleTime, queryClient })
    );
};

afterEach(() => {
    clearAllInstances();
    // Neither manager resets itself between tests; the next one would otherwise inherit whatever
    // focus/online state this one left behind. `undefined` is FocusManager's own "unset, fall back
    // to document.visibilityState" value; OnlineManager has no such fallback (`isOnline()` just
    // returns whatever was last set, and `undefined` reads as falsy — paused, not "default online"),
    // so it resets to its own actual default, `true`.
    focusManager.setFocused(undefined);
    onlineManager.setOnline(true);
});

describe('BROWSER · refetch on window focus', () => {
    it('an ACTIVE, STALE watcher refetches when focus returns', async () => {
        const c = make(0); // staleTime 0: stale the instant it lands
        const apiCall = jest.fn(() => Promise.resolve([...USERS]));
        const { stop } = c.watchAll(apiCall);
        await flush();
        expect(apiCall).toHaveBeenCalledTimes(1);

        focusManager.setFocused(false);
        focusManager.setFocused(true); // the false→true transition is what triggers a refetch
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(2);
        stop();
    });

    it("an ACTIVE, FRESH watcher does NOT refetch on focus: TanStack's own default is conditional", async () => {
        const c = make(60_000); // fresh for a full minute
        const apiCall = jest.fn(() => Promise.resolve([...USERS]));
        const { stop } = c.watchAll(apiCall);
        await flush();
        expect(apiCall).toHaveBeenCalledTimes(1);

        focusManager.setFocused(false);
        focusManager.setFocused(true);
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(1); // still fresh — nothing to refetch
        stop();
    });

    it('a one-shot fetchAll has no observer left to react to a later focus change', async () => {
        const c = make(0);
        const apiCall = jest.fn(() => Promise.resolve([...USERS]));
        await c.fetchAll(apiCall);
        expect(apiCall).toHaveBeenCalledTimes(1);

        focusManager.setFocused(false);
        focusManager.setFocused(true);
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(1); // fetchAll never watches; nothing refetches it
    });
});

describe('BROWSER · refetch on reconnect', () => {
    it('an ACTIVE, STALE watcher refetches when the connection returns', async () => {
        const c = make(0);
        const apiCall = jest.fn(() => Promise.resolve([...USERS]));
        const { stop } = c.watchAll(apiCall);
        await flush();
        expect(apiCall).toHaveBeenCalledTimes(1);

        onlineManager.setOnline(false);
        onlineManager.setOnline(true);
        await flush();

        expect(apiCall).toHaveBeenCalledTimes(2);
        stop();
    });

    it('a query started while offline stays pending, then runs once reconnected (networkMode: online)', async () => {
        onlineManager.setOnline(false);
        const c = make(0);
        const apiCall = jest.fn(() => Promise.resolve([...USERS]));
        const fetchPromise = c.fetchAll(apiCall);
        await flush();
        expect(apiCall).not.toHaveBeenCalled(); // paused: 'online' mode refuses to run offline

        onlineManager.setOnline(true);
        await fetchPromise;

        expect(apiCall).toHaveBeenCalledTimes(1);
    });
});
