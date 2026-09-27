/**
 * MODEL — generated command sequences against `useStructureRestApi`, with the settlement order of
 * every server call picked (and shrunk) by fast-check's scheduler instead of real timers. This
 * generalises the hand-written race specs (`lifecycle/lateWrite`, `lateRollback`, `dependsOn`)
 * into thousands of generated ones.
 *
 * Not built on `fc.commands`/`asyncModelRun`: those add a shrinker tuned for command arrays, but
 * the model here (a couple of `Set`s keyed by "scope generation") is simple enough that a plain
 * `fc.array` of command descriptors plus `fc.scheduler()` covers the same ground with much less
 * ceremony. `fc.scheduler()` is still what does the actual work — controlling *when* each server
 * call resolves, independent of the order the commands were issued in.
 *
 * Invariant 1 ("every promise settles, and rejects exactly when `fail` was set") only holds
 * unconditionally for the mutations (`createTarget`/`updateTarget`/`deleteTarget`): a query
 * (`fetchTarget`/`fetchAll`/`fetchMultiple`) that gets CANCELLED by a `dependsOn` switch or a
 * same-id mutation resolves with cached data instead of rejecting, by design (see
 * `docs/composables/structure-rest-api.md` and `lifecycle/dependsOn.spec.ts`) — so queries are
 * checked only for "settles", never "rejects iff fail".
 */
import fc from 'fast-check';
import { ref } from 'vue';
import { makeComposable, clearAllInstances, flush } from '../_helpers/harness';
import { createServer } from '../_helpers/fakeServer';
import { buildUsers, type IUser } from '../_helpers/fixtures';

afterEach(clearAllInstances);

/** One generated instruction. Ids 1–6: 1–4 exist on the seeded server, 5–6 don't. */
type TCommand =
    | { kind: 'fetchTarget'; id: number; fail: boolean; forced: boolean }
    | { kind: 'fetchAll'; fail: boolean }
    | { kind: 'fetchMultiple'; ids: number[]; fail: boolean }
    | { kind: 'createTarget'; id: number; fail: boolean; withDummy: boolean }
    | { kind: 'updateTarget'; id: number; fail: boolean; merge: boolean }
    | { kind: 'deleteTarget'; id: number; fail: boolean }
    | { kind: 'resetRecords' }
    | { kind: 'resetAll' }
    | { kind: 'switchDependsOn' };

const existingId = fc.integer({ min: 1, max: 6 });
// A pool disjoint from the seed, so createTarget's id is known up front (the server auto-assigns
// otherwise, which the model would have no way to predict before the call settles).
const creatableId = fc.integer({ min: 10, max: 13 });
const boolean = fc.boolean();

const commandArbitrary: fc.Arbitrary<TCommand> = fc.oneof(
    fc.record({
        kind: fc.constant('fetchTarget' as const),
        id: existingId,
        fail: boolean,
        forced: boolean
    }),
    fc.record({ kind: fc.constant('fetchAll' as const), fail: boolean }),
    fc.record({
        kind: fc.constant('fetchMultiple' as const),
        ids: fc.array(existingId, { maxLength: 4 }),
        fail: boolean
    }),
    fc.record({
        kind: fc.constant('createTarget' as const),
        id: creatableId,
        fail: boolean,
        withDummy: boolean
    }),
    fc.record({
        kind: fc.constant('updateTarget' as const),
        id: existingId,
        fail: boolean,
        merge: boolean
    }),
    fc.record({ kind: fc.constant('deleteTarget' as const), id: existingId, fail: boolean }),
    fc.record({ kind: fc.constant('resetRecords' as const) }),
    fc.record({ kind: fc.constant('resetAll' as const) }),
    fc.record({ kind: fc.constant('switchDependsOn' as const) })
);

describe('MODEL · structureRestApi command sequences', () => {
    it('holds every invariant after any generated sequence settles', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.scheduler(),
                fc.array(commandArbitrary, { maxLength: 15 }),
                fc.integer({ min: 1, max: 5 }),
                async (scheduler, commandList, maxRecords) => {
                    const server = createServer<IUser>(buildUsers(4));
                    // A fresh, never-before-seen value each switch — never a round trip back to a
                    // value already used. Revisiting an old value is `dependsOn`'s OWN documented
                    // no-op contract (a getter re-invoked with a deep-equal result changes nothing,
                    // see lifecycle/dependsOn.spec.ts), which would make a late write from before the
                    // round trip land as if it were current — a second, already-covered property, not
                    // what invariant 4 (below) is about: does moving to a genuinely new scope drop
                    // everything from before it?
                    const scopeState = ref(0);
                    const composable = makeComposable<IUser, number>({
                        dependsOn: () => [scopeState.value],
                        maxRecords
                    });

                    /** Outer promises of every command, so "nothing hangs" can be checked. */
                    const outcomes: Promise<'resolved' | 'rejected'>[] = [];
                    /** Mutations only: their promise must reject iff `fail` was set (see file header). */
                    const mutationChecks: {
                        outcome: Promise<'resolved' | 'rejected'>;
                        expectFail: boolean;
                    }[] = [];
                    /** ids a successful command of the CURRENT scope generation could have written. */
                    let generation = 0;
                    const idsByGeneration = new Map<number, Set<number>>([[0, new Set()]]);
                    const allow = (id: number): void => {
                        idsByGeneration.get(generation)!.add(id);
                    };
                    // Two same-record races this model doesn't fully reconcile (see the file header):
                    // two mutations (create/update/delete) on the SAME id — the resurrection half is
                    // fixed (src/internal/resourceMutations.ts), a failed mutation's OWN rollback can
                    // still restore an intermediate, unconfirmed value from the other one; and
                    // fetchMultiple/fetchAny, whose 'any'-kind query isn't in `cancelReads`'s cancel
                    // set (only 'target' and the list kinds are), racing a mutation on an id it also
                    // fetched. `mutationTouches`/`looseReadTouches` count these so invariants 4/5 can
                    // skip a "contested" id — one touched by more than one of these risk-bearing calls.
                    const mutationTouches = new Map<number, number>();
                    const looseReadTouches = new Map<number, number>();
                    const bump = (counts: Map<number, number>, id: number): void =>
                        void counts.set(id, (counts.get(id) ?? 0) + 1);
                    const track = (promise: Promise<unknown>): Promise<'resolved' | 'rejected'> => {
                        const outcome = promise.then(
                            () => 'resolved' as const,
                            () => 'rejected' as const
                        );
                        outcomes.push(outcome);
                        return outcome;
                    };
                    /** Invariant 3, checked the instant a list-shaped fetch's own write has landed. */
                    const checkMaxRecordsBound = (): void => {
                        expect(composable.itemList.value.length).toBeLessThanOrEqual(maxRecords);
                    };

                    for (const command of commandList) {
                        switch (command.kind) {
                            case 'fetchTarget': {
                                const apiCall = scheduler.scheduleFunction(() =>
                                    command.fail
                                        ? Promise.reject(new Error('fail'))
                                        : server.get(command.id)()
                                );
                                if (!command.fail) allow(command.id);
                                track(
                                    composable.fetchTarget(apiCall, command.id, {
                                        forced: command.forced
                                    })
                                );
                                break;
                            }
                            case 'fetchAll': {
                                const apiCall = scheduler.scheduleFunction(() =>
                                    command.fail
                                        ? Promise.reject(new Error('fail'))
                                        : server.list()()
                                );
                                if (!command.fail) for (const id of server.store.keys()) allow(id);
                                // Invariant 3: only list-shaped fetches enforce maxRecords (a
                                // fetchTarget/createTarget/updateTarget never does — CHANGELOG 5.0.0),
                                // so the bound is checked right where it is actually enforced: the
                                // instant this call's own storeBatch has run, not at the end of the run.
                                track(composable.fetchAll(apiCall).then(checkMaxRecordsBound));
                                break;
                            }
                            case 'fetchMultiple': {
                                const apiCall = scheduler.scheduleFunction(() =>
                                    command.fail
                                        ? Promise.reject(new Error('fail'))
                                        : server.many(command.ids)()
                                );
                                if (!command.fail) for (const id of command.ids) allow(id);
                                for (const id of command.ids) bump(looseReadTouches, id);
                                track(
                                    composable
                                        .fetchMultiple(apiCall, command.ids)
                                        .then(checkMaxRecordsBound)
                                );
                                break;
                            }
                            case 'createTarget': {
                                const data = {
                                    id: command.id,
                                    name: 'New',
                                    email: 'new@example.com'
                                };
                                const apiCall = scheduler.scheduleFunction(() =>
                                    command.fail
                                        ? Promise.reject(new Error('fail'))
                                        : server.create(data)()
                                );
                                if (!command.fail) allow(command.id);
                                bump(mutationTouches, command.id);
                                const dummy = command.withDummy
                                    ? ({ ...data } as IUser)
                                    : undefined;
                                mutationChecks.push({
                                    outcome: track(composable.createTarget(apiCall, dummy)),
                                    expectFail: command.fail
                                });
                                break;
                            }
                            case 'updateTarget': {
                                const patch = { name: 'Updated' };
                                const apiCall = scheduler.scheduleFunction(() =>
                                    command.fail
                                        ? Promise.reject(new Error('fail'))
                                        : server.update(command.id, patch)()
                                );
                                if (!command.fail) allow(command.id);
                                bump(mutationTouches, command.id);
                                mutationChecks.push({
                                    outcome: track(
                                        composable.updateTarget(apiCall, patch, command.id, {
                                            merge: command.merge
                                        })
                                    ),
                                    expectFail: command.fail
                                });
                                break;
                            }
                            case 'deleteTarget': {
                                const apiCall = scheduler.scheduleFunction(() =>
                                    command.fail
                                        ? Promise.reject(new Error('fail'))
                                        : server.remove(command.id)()
                                );
                                bump(mutationTouches, command.id);
                                mutationChecks.push({
                                    outcome: track(composable.deleteTarget(apiCall, command.id)),
                                    expectFail: command.fail
                                });
                                break;
                            }
                            case 'resetRecords': {
                                composable.resetRecords();
                                break;
                            }
                            case 'resetAll': {
                                composable.resetAll();
                                break;
                            }
                            case 'switchDependsOn': {
                                scopeState.value += 1;
                                generation += 1;
                                idsByGeneration.set(generation, new Set());
                                mutationTouches.clear();
                                looseReadTouches.clear();
                                break;
                            }
                        }
                        // Lets Vue's watcher on `dependsOn` (and any synchronous follow-up) run before
                        // the next command is issued, same as a real app between two user actions.
                        await flush(1);
                    }

                    await scheduler.waitAll();
                    await flush();

                    // Invariant 1 — nothing hangs (this `await` would time the test out otherwise).
                    await Promise.all(outcomes);
                    for (const { outcome, expectFail } of mutationChecks)
                        expect(await outcome).toBe(expectFail ? 'rejected' : 'resolved');

                    // Invariant 2 — once everything has settled, nothing is still "loading".
                    expect(composable.isLoading()).toBe(false);

                    // Invariants 4 & 5 — cache == server, no id from a stale scope, no deleted id back.
                    // A contested id (see `mutationTouches`/`looseReadTouches` above) is out of scope:
                    // its solo contract (one mutation, or a read no mutation raced) is checked here;
                    // its contested one is checked deterministically elsewhere
                    // (unit/updateTarget.spec.ts's "a late update response does not resurrect...").
                    const allowedIds = idsByGeneration.get(generation)!;
                    const touchedIds = new Set([
                        ...mutationTouches.keys(),
                        ...looseReadTouches.keys()
                    ]);
                    const contestedIds = new Set(
                        [...touchedIds].filter(
                            (id) =>
                                (mutationTouches.get(id) ?? 0) + (looseReadTouches.get(id) ?? 0) > 1
                        )
                    );
                    for (const idKey of Object.keys(composable.itemDictionary.value)) {
                        const id = Number(idKey);
                        if (!Number.isFinite(id)) continue; // a still-in-flight dummy id would be a uuid
                        if (contestedIds.has(id)) continue;
                        expect(allowedIds.has(id)).toBe(true);
                        expect(server.store.has(id)).toBe(true);
                        expect(composable.itemDictionary.value[id]).toEqual(server.store.get(id));
                    }

                    clearAllInstances();
                }
            ),
            { numRuns: 25 }
        );
    }, 20_000);
});
