/**
 * @jest-environment @stryker-mutator/jest-runner/jest-env/jsdom
 *
 * Plain 'jsdom' also runs under `npm test`, but Stryker's jest-runner needs its own
 * coverage-instrumented wrapper around jest-environment-jsdom to mutation-test this file —
 * see stryker-mutator.io/docs/stryker-js/jest-runner#coverage-analysis.
 *
 * BROWSER — `VueQueryPlugin` inside a real, mounted component (`createApp(...).mount(div)`, no
 * `@vue/test-utils`): the one path every other spec's `runInjected`/`runWithContext` shortcuts
 * around, and the one where a composable's internal `effectScope()` calls are real CHILDREN of the
 * component's own scope, so `app.unmount()` actually cascades into them — nothing here needs a
 * `document`, so Jest's default Node environment would accept `document.createElement` failing
 * silently as `undefined`, masking exactly the wiring this file exists to prove. A real mount is
 * the point, so this does not route through `_helpers/harness.ts`'s `runInjected` (which never
 * mounts an app) — only its `newTestClient()`/`flush()` fit here, both reused below.
 */
import { createApp, h, type App } from 'vue';
import { QueryClient, VueQueryPlugin, useQueryClient } from '@tanstack/vue-query';
import { useStructureRestApi } from '../../src/composables/structureRestApi';
import { newTestClient, flush } from '../structureRestApi/_helpers/harness';
import { USERS, type IUser } from '../structureRestApi/_helpers/fixtures';

/** The suite renders nothing: only setup()'s injection/composable wiring is under test. */
const renderNothing = () => h('div');

/** The app/client each test builds, so afterEach tears them down even if an assertion throws. */
let mountedApp: App | undefined;
let activeQueryClient: QueryClient | undefined;

afterEach(() => {
    // undefined here means the test itself already unmounted it (that's what it's testing) —
    // unmounting twice is harmless but warns, so skip it rather than call unmount blindly.
    mountedApp?.unmount();
    mountedApp = undefined;
    activeQueryClient?.clear();
    activeQueryClient = undefined;
});

describe('BROWSER · VueQueryPlugin in a mounted component', () => {
    it('useQueryClient() inside setup() finds the client VueQueryPlugin provided', () => {
        const queryClient = newTestClient();
        activeQueryClient = queryClient;
        let found: QueryClient | undefined;
        const app = createApp({
            setup() {
                found = useQueryClient();
                return renderNothing;
            }
        });
        app.use(VueQueryPlugin, { queryClient });
        app.mount(document.createElement('div'));
        mountedApp = app;

        expect(found).toBe(queryClient);
    });

    it('a resource built inside setup() finds its client the same way, and watches while mounted', async () => {
        const queryClient = newTestClient();
        activeQueryClient = queryClient;
        const apiCall = jest.fn(() => Promise.resolve([...USERS]));
        let resource: ReturnType<typeof useStructureRestApi<IUser, number>> | undefined;

        const app = createApp({
            setup() {
                resource = useStructureRestApi<IUser, number>({ resourceKey: 'resource' });
                resource.watchAll(apiCall);
                return renderNothing;
            }
        });
        app.use(VueQueryPlugin, { queryClient });
        app.mount(document.createElement('div'));
        mountedApp = app;
        await flush();

        expect(resource!.queryClient).toBe(queryClient);
        expect(apiCall).toHaveBeenCalledTimes(1);

        await queryClient.invalidateQueries({ queryKey: ['resource'] });
        await flush();
        expect(apiCall).toHaveBeenCalledTimes(2); // active: the invalidation refetches it
    });

    it('unmounting stops the watcher: an invalidation afterwards refetches nothing', async () => {
        const queryClient = newTestClient();
        activeQueryClient = queryClient;
        const apiCall = jest.fn(() => Promise.resolve([...USERS]));

        const app = createApp({
            setup() {
                const resource = useStructureRestApi<IUser, number>({ resourceKey: 'resource' });
                resource.watchAll(apiCall);
                return renderNothing;
            }
        });
        app.use(VueQueryPlugin, { queryClient });
        app.mount(document.createElement('div'));
        await flush();
        expect(apiCall).toHaveBeenCalledTimes(1);

        // The behaviour under test, not teardown: unmount now, mid-test.
        app.unmount();
        mountedApp = undefined;

        await queryClient.invalidateQueries({ queryKey: ['resource'] });
        await flush();
        expect(apiCall).toHaveBeenCalledTimes(1); // no observer left to react to the invalidation
    });
});
