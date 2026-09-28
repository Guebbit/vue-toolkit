/**
 * @jest-environment @stryker-mutator/jest-runner/jest-env/jsdom
 *
 * Plain 'jsdom' also runs under `npm test`, but Stryker's jest-runner needs its own
 * coverage-instrumented wrapper around jest-environment-jsdom to mutation-test this file —
 * see stryker-mutator.io/docs/stryker-js/jest-runner#coverage-analysis.
 *
 * LIFECYCLE — a resource built inside a Pinia SETUP store finds its `QueryClient` through
 * injection, the same way a component's `setup()` does.
 *
 * Inside a component's `setup()`, `inject()` works on any Pinia version: the ambient component
 * instance is the injection context, regardless of what Pinia does around the store's own setup
 * function. The version floor only matters OUTSIDE a component — a store built from a router
 * guard or `main.ts` via `useStore(pinia)` — where there is no ambient component instance:
 * - pinia >=2.1 wraps that call in `app.runWithContext` (`pinia._a.runWithContext`), so
 *   `inject()` still finds what `app.provide()` registered.
 * - pinia <2.1 runs the setup function bare (just `pinia._e.run(...)`), with no injection
 *   context at all in that case, so `useQueryClient()` throws.
 * This is why the peer floor is `pinia ^2.1`, not `>=2.0.0` (see V4.4 / VD5's sibling decision in
 * package.json's `peerDependencies`).
 */
import { createApp, h, type App } from 'vue';
import { createPinia, defineStore } from 'pinia';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { useStructureRestApi } from '../../../src/composables/structureRestApi';
import type { IUser } from '../_helpers/fixtures';

/** The suite renders nothing: only setup()'s injection/store wiring is under test. */
const renderNothing = () => h('div');

describe('LIFECYCLE · a resource inside a Pinia setup store', () => {
    /** The mounted app a case builds, so afterEach can unmount it — only set once mount() runs. */
    let mountedApp: App | undefined;

    afterEach(() => {
        mountedApp?.unmount();
        mountedApp = undefined;
    });

    it("finds VueQueryPlugin's client through injection, not a fallback of its own", () => {
        const queryClient = new QueryClient();
        const useResourceStore = defineStore('resource', () =>
            useStructureRestApi<IUser, number>({ resourceKey: 'users' })
        );

        let store: ReturnType<typeof useResourceStore> | undefined;
        const app = createApp({
            setup() {
                store = useResourceStore();
                return renderNothing;
            }
        });
        app.use(createPinia());
        app.use(VueQueryPlugin, { queryClient });
        app.mount(document.createElement('div'));
        mountedApp = app;

        expect(store?.queryClient).toBe(queryClient);
    });

    it("finds VueQueryPlugin's client via app.runWithContext when built outside a component (the pinia >=2.1 floor)", () => {
        const queryClient = new QueryClient();
        const useResourceStore = defineStore('resource-outside-component', () =>
            useStructureRestApi<IUser, number>({ resourceKey: 'users' })
        );

        const pinia = createPinia();
        // No component ever mounts: app.use() alone is enough to set pinia._a (the app) and
        // register VueQueryPlugin's provide() — both of which app.runWithContext relies on.
        const app = createApp({});
        app.use(pinia);
        app.use(VueQueryPlugin, { queryClient });

        // Called with no active component instance — the case pinia <2.1 cannot support,
        // because it never wraps this call in app.runWithContext.
        const store = useResourceStore(pinia);

        expect(store.queryClient).toBe(queryClient);
    });
});
