/**
 * @jest-environment @stryker-mutator/jest-runner/jest-env/jsdom
 *
 * Plain 'jsdom' also runs under `npm test`, but Stryker's jest-runner needs its own
 * coverage-instrumented wrapper around jest-environment-jsdom to mutation-test this file —
 * see stryker-mutator.io/docs/stryker-js/jest-runner#coverage-analysis.
 *
 * LIFECYCLE — a search resource built inside a mounted component's `setup()`, watched from code
 * that runs outside it (a click handler, after an `await`, a Pinia store first built elsewhere).
 *
 * Vue orders its pre-flush watchers by the component that created them, and a watcher created
 * with no current component runs before every component's. The contracts below must hold
 * whichever component, if any, each watcher was created under.
 */
import { createApp, h, ref } from 'vue';
import { useStructureSearchApi } from '../../../src/composables/structureSearchApi';
import { flush, newTestClient } from '../_helpers/harness';
import type { ISearchResult } from '../../../src/composables/structureSearchApi';

/** The suite renders nothing: only setup()'s wiring is under test. */
const renderNothing = () => h('div');

/** What a test built, torn down after it, last built first. */
const teardown: (() => void)[] = [];

afterEach(() => {
    for (const undo of teardown.splice(0).toReversed()) undo();
});

/**
 * Builds the resource inside a mounted root component's `setup()`, and returns it.
 *
 * @returns the resource
 */
const buildInComponent = () => {
    const queryClient = newTestClient();
    let resource!: ReturnType<typeof useStructureSearchApi<{ id: number }, number>>;
    const app = createApp({
        setup() {
            resource = useStructureSearchApi<{ id: number }, number>(ref({}), {
                resourceKey: 'resource',
                queryClient
            });
            return renderNothing;
        }
    });
    app.mount(document.createElement('div'));
    teardown.push(() => {
        app.unmount();
        queryClient.clear();
    });
    return resource;
};

/** A search operation over 100 matches. */
const searchOperation = () =>
    jest.fn((_filters: object, _page: number, _pageSize: number) =>
        Promise.resolve<ISearchResult<{ id: number }>>({ items: [], totalItems: 100 })
    );

describe('LIFECYCLE · search built in a mounted component, watched outside its setup', () => {
    it('a pageSize change on a later page fetches page 1 of the new size — once, never the old page', async () => {
        const resource = buildInComponent();
        const operation = searchOperation();
        // Started from outside any component, like a click handler: no scope stops it but ours.
        teardown.push(resource.watchSearch(operation).stop);
        await flush();
        resource.pageCurrent.value = 3;
        await flush();
        operation.mockClear();

        resource.pageSize.value = 25;
        await flush();

        expect(resource.pageCurrent.value).toBe(1);
        // (filters, page, pageSize) only: jsdom's AbortSignal breaks Jest's diff printer.
        expect(operation.mock.calls.map((call) => call.slice(0, 3))).toEqual([[{}, 1, 25]]);
    });
});
