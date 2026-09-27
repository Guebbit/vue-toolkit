/**
 * @jest-environment jsdom
 *
 * LIFECYCLE — a resource built inside a Pinia SETUP store finds its `QueryClient` through
 * injection, the same way a component's `setup()` does.
 *
 * A Pinia OPTIONS store's `setup()`-equivalent (its `state`/`actions`) never runs inside an
 * injection context at all, and older Pinia (< 2.1) did not run a SETUP store's own setup
 * function inside one either — `inject()`, and therefore `useQueryClient()`, silently found
 * nothing. This is why the peer floor is `pinia ^2.1`, not `>=2.0.0` (see V4.4 / VD5's sibling
 * decision in package.json's `peerDependencies`).
 */
import { createApp, h } from 'vue';
import { createPinia, defineStore } from 'pinia';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { useStructureRestApi } from '../../../src/composables/structureRestApi';
import type { IUser } from '../_helpers/fixtures';

/** The suite renders nothing: only setup()'s injection/store wiring is under test. */
const renderNothing = () => h('div');

describe('LIFECYCLE · a resource inside a Pinia setup store', () => {
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

        expect(store?.queryClient).toBe(queryClient);
        app.unmount();
    });
});
