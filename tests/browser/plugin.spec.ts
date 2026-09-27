/**
 * @jest-environment jsdom
 *
 * BROWSER — `VueQueryPlugin` inside a real, mounted component (`createApp(...).mount(div)`, no
 * `@vue/test-utils`): the one path every other spec's `runInjected`/`runWithContext` shortcuts
 * around, and the one where a composable's internal `effectScope()` calls are real CHILDREN of the
 * component's own scope, so `app.unmount()` actually cascades into them — nothing here needs a
 * `document`, so Jest's default Node environment would accept `document.createElement` failing
 * silently as `undefined`, masking exactly the wiring this file exists to prove.
 */
import { createApp, h } from 'vue';
import { QueryClient, VueQueryPlugin, useQueryClient } from '@tanstack/vue-query';
import { useStructureRestApi } from '../../src/composables/structureRestApi';
import { USERS, type IUser } from '../structureRestApi/_helpers/fixtures';

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** The suite renders nothing: only setup()'s injection/composable wiring is under test. */
const renderNothing = () => h('div');

describe('BROWSER · VueQueryPlugin in a mounted component', () => {
    it('useQueryClient() inside setup() finds the client VueQueryPlugin provided', () => {
        const queryClient = new QueryClient();
        let found: QueryClient | undefined;
        const app = createApp({
            setup() {
                found = useQueryClient();
                return renderNothing;
            }
        });
        app.use(VueQueryPlugin, { queryClient });
        app.mount(document.createElement('div'));

        expect(found).toBe(queryClient);
        app.unmount();
    });

    it('a resource built inside setup() finds its client the same way, and watches while mounted', async () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false, networkMode: 'always' } }
        });
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
        await flush();

        expect(resource!.queryClient).toBe(queryClient);
        expect(apiCall).toHaveBeenCalledTimes(1);

        await queryClient.invalidateQueries({ queryKey: ['resource'] });
        await flush();
        expect(apiCall).toHaveBeenCalledTimes(2); // active: the invalidation refetches it

        queryClient.clear();
    });

    it('unmounting stops the watcher: an invalidation afterwards refetches nothing', async () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false, networkMode: 'always' } }
        });
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

        app.unmount();

        await queryClient.invalidateQueries({ queryKey: ['resource'] });
        await flush();
        expect(apiCall).toHaveBeenCalledTimes(1); // no observer left to react to the invalidation

        queryClient.clear();
    });
});
