/**
 * UNIT — internal/recordMutations.ts: which mutations count as "changing record `id`", and when a
 * read that began at `readStartedAt` may still write it.
 *   - only `update` and `delete` mutations are record mutations; `create` is not
 *   - a mutation without a `mutationKey`, or without `meta`, is handled without throwing
 *   - a mutation that started exactly when the read started still blocks the write
 */

import type { MutationOptions, QueryClient } from '@tanstack/vue-query';
import { canWrite, recordMutationsOf } from '../../src/internal/recordMutations';
import { newTestClient } from '../structureRestApi/_helpers/harness';

/** Clients built by the current test, cleared after it. */
const clients: QueryClient[] = [];

afterEach(() => {
    for (const client of clients.splice(0)) client.clear();
});

/** A client torn down after the test. */
const makeClient = (): QueryClient => {
    const queryClient = newTestClient();
    clients.push(queryClient);
    return queryClient;
};

/**
 * Runs one mutation to completion in the client's mutation cache.
 *
 * @param queryClient - the client to run it on
 * @param options - mutation options (key, meta)
 * @returns settles once the mutation succeeded
 */
const runMutation = (
    queryClient: QueryClient,
    options: Pick<MutationOptions, 'mutationKey' | 'meta'>
): Promise<unknown> =>
    queryClient
        .getMutationCache()
        .build(queryClient, { ...options, mutationFn: () => Promise.resolve('done') })
        .execute(undefined);

describe('UNIT · recordMutations.recordMutationsOf', () => {
    it.each([
        ['update', true],
        ['delete', true],
        ['create', false]
    ])('a "%s" mutation of the record is matched: %p', async (kind, matched) => {
        const queryClient = makeClient();
        await runMutation(queryClient, { mutationKey: ['res', kind, '1'] });

        expect(recordMutationsOf(queryClient, 'res', 1)).toHaveLength(matched ? 1 : 0);
    });

    it('skips a mutation that has no mutationKey instead of throwing', async () => {
        const queryClient = makeClient();
        await runMutation(queryClient, {});
        await runMutation(queryClient, { mutationKey: ['res', 'update', '1'] });

        expect(recordMutationsOf(queryClient, 'res', 1)).toHaveLength(1);
    });
});

/** A finished `update` of record 1 that started at `startedAt`, in scope `[]`. */
const finishedUpdate = async (startedAt: number): Promise<QueryClient> => {
    const queryClient = makeClient();
    await runMutation(queryClient, {
        mutationKey: ['res', 'update', '1'],
        meta: { scope: [], startedAt }
    });
    return queryClient;
};

describe('UNIT · recordMutations.canWrite', () => {
    it('blocks a read that started at the very moment the mutation started', async () => {
        const queryClient = await finishedUpdate(5);

        expect(canWrite(queryClient, 'res', 1, [], 5)).toBe(false);
    });

    it('blocks a read that started before the mutation', async () => {
        const queryClient = await finishedUpdate(5);

        expect(canWrite(queryClient, 'res', 1, [], 4)).toBe(false);
    });

    it('allows a read that started after the finished mutation', async () => {
        const queryClient = await finishedUpdate(5);

        expect(canWrite(queryClient, 'res', 1, [], 6)).toBe(true);
    });

    it('treats a mutation without meta as started at 0, without throwing', async () => {
        const queryClient = makeClient();
        await runMutation(queryClient, { mutationKey: ['res', 'update', '1'] });
        // No meta means no scope: only an undefined scope matches it.
        const noScope = undefined as unknown as unknown[];

        expect(canWrite(queryClient, 'res', 1, noScope, 1)).toBe(true);
        expect(canWrite(queryClient, 'res', 1, noScope, 0)).toBe(false);
    });
});
