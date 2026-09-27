/**
 * LIFECYCLE — a resource built outside an effect scope warns once, naming the resourceKey.
 *
 * Every cache subscription a resource makes (resourceActivity, the scope registry claim) is torn
 * down through `onScopeDispose`. With no effect scope active there is nothing to call it, and no
 * other way to stop them: they leak for the QueryClient's whole lifetime, silently, with no handle
 * the caller could use to clean up even if they noticed. `console.warn` surfaces it instead of
 * leaving it invisible; deduped per resourceKey so a factory called in a loop doesn't flood it.
 */

import { effectScope } from 'vue';
import { newTestClient } from '../_helpers/harness';
import { useStructureRestApi } from '../../../src/composables/structureRestApi';

describe('LIFECYCLE · building a resource outside an effect scope', () => {
    it('warns once naming the resourceKey, and not again for the same key', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

        useStructureRestApi({ resourceKey: 'leaky-a', queryClient: newTestClient() });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('leaky-a');

        // a second instance of the SAME resourceKey does not warn again
        useStructureRestApi({ resourceKey: 'leaky-a', queryClient: newTestClient() });
        expect(warn).toHaveBeenCalledTimes(1);

        // a DIFFERENT resourceKey warns again, on its own
        useStructureRestApi({ resourceKey: 'leaky-b', queryClient: newTestClient() });
        expect(warn).toHaveBeenCalledTimes(2);
        expect(warn.mock.calls[1][0]).toContain('leaky-b');

        warn.mockRestore();
    });

    it('does not warn when built inside an effect scope', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const scope = effectScope();

        scope.run(() =>
            useStructureRestApi({ resourceKey: 'leaky-c', queryClient: newTestClient() })
        );

        expect(warn).not.toHaveBeenCalled();
        scope.stop();
        warn.mockRestore();
    });
});
