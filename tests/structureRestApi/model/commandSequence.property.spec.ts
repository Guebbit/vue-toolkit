/**
 * MODEL — generated command sequences against `useStructureRestApi`, with the settlement order of
 * every server call picked (and shrunk) by fast-check's scheduler instead of real timers. This
 * generalises the hand-written race specs (`lifecycle/lateWrite`, `lateRollback`, `dependsOn`)
 * into many generated ones (`FC_NUM_RUNS`-controlled — see below).
 *
 * Not built on `fc.commands`/`asyncModelRun`: those add a shrinker tuned for command arrays, but
 * the model here (a couple of `Set`s keyed by "scope generation") is simple enough that a plain
 * `fc.array` of command descriptors plus `fc.scheduler()` covers the same ground with much less
 * ceremony. `fc.scheduler()` is still what does the actual work — controlling *when* each server
 * call resolves, independent of the order the commands were issued in.
 *
 * **Write timing.** `fakeServer.ts`'s `create`/`update`/`remove` mutate `server.store` the instant
 * their closure is called, not when their reply is delivered — so by default a read issued after a
 * mutation call can never observe pre-mutation data, and races like "a read lands while a delete is
 * in flight" are structurally unreachable. `scheduleCall`, below, fixes this from the spec side
 * (without touching the shared helper): every apiCall's real server call is deferred until the
 * scheduler actually releases that task, so the scheduler's release order — not issue order — now
 * decides what each call sees and writes.
 *
 * **Checking after the full settle, not at each landing.** `scheduler.waitOne()` only waits for
 * the SCHEDULED promise itself to resolve, not for what the engine does with it afterwards (a
 * write guard released in a `.finally`, TanStack's own batched notifications) — so a check chained
 * straight onto one command's own promise can run before ANOTHER, unrelated command's downstream
 * effects have finished, even though its OWN scheduled task already reported "resolved". Every
 * command's outcome and inputs to the invariants below are instead collected first, and every
 * assertion runs only after `scheduler.waitAll()` and `flush()` have both fully drained — the same
 * point the original, always-safe invariant 4/5 check already relied on.
 *
 * **Invariants:**
 * 1. Every promise settles, and a mutation's rejects exactly when `fail` was set. A query
 *    (`fetchTarget`/`fetchAll`/`fetchMultiple`) that gets CANCELLED by a `dependsOn` switch or a
 *    same-id mutation resolves with cached data instead of rejecting, by design (see
 *    `docs/composables/structure-rest-api.md` and `lifecycle/dependsOn.spec.ts`) — so queries are
 *    checked only for "settles", never "rejects iff fail".
 * 2. Once everything has settled, nothing is still `isLoading()`.
 * 3. `maxRecords` — meaningful only for a PURE-READS epoch (`hasMutation`; a create/update/delete
 *    anywhere makes both bounds below unpredictable — see its own docs), with no reset/switch since
 *    (`everReset`) and every contributed id touched exactly once this epoch (`anyContributedIdContested`
 *    — which of an id's several touches is "the genuinely new one" that actually enforces the bound
 *    is release-order-dependent otherwise). Two bounds, both over the CURRENT epoch's landed reads:
 *    - upper bound: the list can never hold more than the LARGEST single read's own incoming batch
 *      (CHANGELOG 5.0.0: "the list fetch that crossed it keeps its own entry, resolving its items")
 *      — no matter which order the scheduler released everything in.
 *    - exact bound: if every read's own incoming batch, summed with duplicates (`sumRawIncoming` —
 *      `enforceMaxRecords`'s own threshold counts a repeated requested id, e.g. fetchMultiple's own
 *      `ids: [1, 1, 3]`, twice, even though only one entry survives), would ALREADY fit under
 *      `maxRecords`, nothing could have needed wiping, so the total must be EXACTLY the settled
 *      (deduplicated) id count. This is the half the hollow version could never fail on: an eviction
 *      that fires one record too early (the `<=` → `<` mutant on `restResource.ts`'s bound check)
 *      only ever REMOVES something it shouldn't — never adds — so only an exact-count check, not an
 *      upper bound, can catch it.
 * 4 & 5. The cache matches the server: nothing cached is illegitimate (`allowedIds`/`server.store`,
 *    checked directly below), and nothing that landed uncontested is MISSING (`checkLanded`).
 *    "Uncontested" excludes same-id races, narrowly where the mechanism is known, broadly where it
 *    isn't (never blanket across UNRELATED ids either way):
 *    - two mutations (create/update/delete) racing the same id: the resurrection half is fixed
 *      (`src/internal/resourceMutations.ts`), a failed one's OWN rollback can still restore an
 *      intermediate, unconfirmed value from the other.
 *    - `fetchTarget`/`fetchMultiple`/`fetchAny` racing a mutation on an id they also read
 *      (`looseReadTouches`). `fetchMultiple`/`fetchAny`'s 'any'-kind query isn't in `cancelReads`'s
 *      cancel set (only 'target' and the list kinds are) — an unambiguous reason. `fetchTarget` is
 *      tracked the same broad way even though it is safe on its own: blocked by
 *      `recordMutations.ts`'s `canWrite`, `restResource.ts`'s `targetQueryFunction` cancels its
 *      OWN query and returns `{ data: undefined }`, so TanStack discards the answer outright and
 *      reverts to whatever was already cached (pinned by `mutationRace.spec.ts`'s "a fetchTarget
 *      landing while a deleteTarget is in flight does not bring the record back", and
 *      `updateTarget.spec.ts`'s "a read landing while the update is in flight does not stamp the
 *      unconfirmed patch fresh"). `fetchTarget` keeps the
 *      broad tracking anyway: proving every interleaving safe (a longer reset-heavy sequence in
 *      particular — see `mutatedInEpochs`, below, for why a reset doesn't make a stale mutation
 *      stop counting) is out of scope here, and the broad tracking only ever EXCLUDES an id from a
 *      strict check — it can widen what's left unverified, never produce a false failure.
 *    - a mutation from an ABANDONED epoch racing anything on the same id in a LATER one
 *      (`mutatedInEpochs`, keyed by `resetEpoch`, not generation). `canWrite`
 *      (`src/internal/recordMutations.ts`) IS scope-aware: it only matches a mutation
 *      whose own `meta.scope` equals the read's current one, so a mutation from a scope a
 *      `switchDependsOn` has actually moved away from can no longer block anything (doubly so:
 *      `scopeRegistry.isLive` also refuses to store for an abandoned scope at all — see
 *      `restResource.ts`'s module header). But `resetRecords()`/`resetAll()` touch only the QUERY
 *      cache (`queryRecordStore.ts`'s `dropAll`) — never the MutationCache, and never `dependsOn()`
 *      itself — so a mutation already running keeps the SAME `scope` value across a same-scope
 *      reset, and `canWrite` still finds it exactly as before. With `scheduleCall` deferring the
 *      real server write to release time, that mutation's answer can still land — and still count
 *      as blocking, or still be about to write the server itself — after a reset has moved the rest
 *      of this generation's bookkeeping past that id. Not a product bug: nothing in a real app
 *      could reconcile a write from a state it has already reset, either. Keyed by `resetEpoch`
 *      (bumped by a reset OR a switch alike) rather than by scope directly, since telling "reset
 *      within the same scope" apart from "moved to a new scope" here would only ever narrow which
 *      ids get the strict check — never fix a false failure — so it isn't worth the extra model
 *      complexity.
 *    Also: any id that COULD have been evicted this epoch (the exact bound above doesn't hold) is
 *    excluded from `checkLanded` too — the same "which one the scheduler favoured" ambiguity as
 *    invariant 3's own exact-bound half.
 *
 * **Run count.** `numRuns` reads `FC_NUM_RUNS` the same way `tests/_setup/fastCheck.ts` does, with
 * its OWN, smaller default (25, not 50): building a full composable, scope and scheduler per case
 * is heavier than the pure-logic property tests, so the default favours a fast `npm test` — crank
 * it locally the same way, `FC_NUM_RUNS=500 npx jest model`, when hunting something rare — some of
 * this file's own interleavings are rare enough to need thousands of runs to surface.
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
/** Every id any command can ever reference — `existingId` and `creatableId`'s ranges, spelled out
 *  for `fetchAll`'s broad `allTouches` bump (see its case, below). */
const ID_SPACE = [1, 2, 3, 4, 5, 6, 10, 11, 12, 13];

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

                    /**
                     * Defers the REAL server call to the instant the scheduler releases this task,
                     * instead of the instant it's issued (see the file header's "Write timing").
                     * `scheduler.schedule` needs an already-existing promise; a trivial resolved
                     * one is fine since the interesting work happens in the `.then` below, which
                     * only runs once that promise is released.
                     *
                     * @param label - shown in a failing run's shrunk trace
                     * @param fail - reject instead of calling `run`
                     * @param run - the real server call
                     * @returns an apiCall closure, timed by the scheduler
                     */
                    const scheduleCall =
                        <R>(
                            label: string,
                            fail: boolean,
                            run: () => Promise<R>
                        ): (() => Promise<R>) =>
                        () =>
                            scheduler
                                .schedule(Promise.resolve(), label)
                                .then(() => (fail ? Promise.reject(new Error('fail')) : run()));

                    /** Outer promises of every command, so "nothing hangs" can be checked. */
                    const outcomes: Promise<'resolved' | 'rejected'>[] = [];
                    /** Mutations only: their promise must reject iff `fail` was set (see file header). */
                    const mutationChecks: {
                        outcome: Promise<'resolved' | 'rejected'>;
                        expectFail: boolean;
                    }[] = [];
                    /** A wipe-worthy read that might land: what it would contribute to invariant 3's
                     *  bounds, and which ids to run `checkLanded` on, once it's known to have landed.
                     *  `resolve` returns undefined when the read's own apiCall never actually ran — a
                     *  CANCELLED query (invariant 1's own documented exception) still resolves the
                     *  composable's promise, with whatever was already cached, but TanStack never calls
                     *  a cancelled query's queryFn, so the scheduled task backing it is never even
                     *  registered and nothing of THIS read's own landed. */
                    const pendingReads: {
                        settled: Promise<unknown>;
                        epochAtIssue: number;
                        resolve: () => { incoming: number; ids: number[] } | undefined;
                    }[] = [];
                    /** A mutation that might land: its own id (for `checkLanded`) and whether it's a
                     *  create/update — either could add a genuinely new id (see invariant 3's docs). */
                    const pendingMutations: {
                        settled: Promise<unknown>;
                        epochAtIssue: number;
                        id: number;
                        kind: 'create' | 'update' | 'delete';
                    }[] = [];
                    /** ids a successful command of the CURRENT scope generation could have written. */
                    let generation = 0;
                    const idsByGeneration = new Map<number, Set<number>>([[0, new Set()]]);
                    const allow = (id: number): void => {
                        idsByGeneration.get(generation)!.add(id);
                    };
                    /** `allow`, for every id in one go — keeps a command's own case body flat. */
                    const allowAll = (ids: Iterable<number>): void => {
                        for (const id of ids) allow(id);
                    };
                    // Same-record races this model doesn't fully reconcile (see the file header): two
                    // mutations on the SAME id; and any of fetchTarget/fetchMultiple/fetchAny racing a
                    // mutation on an id they also read (fetchTarget needs the same broad treatment as
                    // fetchMultiple/fetchAny despite its own query being in cancelReads's cancel set —
                    // see the file header). `mutationTouches` counts the mutations, `looseReadTouches`
                    // all three read kinds' own ids.
                    const mutationTouches = new Map<number, number>();
                    const looseReadTouches = new Map<number, number>();
                    /** Every id touched by ANY command this generation, read or write — see `checkLanded`. */
                    const allTouches = new Map<number, number>();
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
                    // resetRecords()/resetAll()/switchDependsOn run synchronously (not through the
                    // scheduler) and cancel or abandon whatever they touch — a query already in flight
                    // when one runs settles with whatever's cached NOW (by design, see the file header's
                    // invariant 1), not with its own answer, and `itemList`/`itemDictionary` become a
                    // DIFFERENT scope's view; `enforceMaxRecords`'s own "cached" count resets with it
                    // too. Bumped by any of the three, so a check below can tell "nothing reset or
                    // switched since I was issued" from "one did, I'm no longer predictable" and skip.
                    let resetEpoch = 0;
                    // A reset or switch only clears what's cached AT THAT MOMENT — it has no guard
                    // against a command issued BEFORE it whose effect (deferred to release time, see
                    // scheduleCall) lands AFTER, the same way `keys.isCurrent` guards a scope switch but
                    // NOT a same-scope reset. So once any reset/switch has happened, invariant 3's
                    // aggregate checks (below) can no longer rule out an uncounted, stale-epoch landing
                    // padding the total — they run only for a run with none at all. `checkLanded`'s own
                    // per-id `resetEpoch` guard doesn't need this: it only ever SKIPS a stale command's
                    // own check, never asserts a count that a stale one could silently inflate.
                    let everReset = false;
                    // Invariant 3's bound checks (below) only reason cleanly about pure reads: a create
                    // can upsert a genuinely new id or pad `enforceMaxRecords`'s "cached" count with a
                    // dummy placeholder (`withDummy`) while it's in flight; update/delete additionally
                    // claim record `id` (only they run through `runOptimistic`,
                    // src/internal/resourceMutations.ts — see `canWrite`, below), which can make a
                    // concurrent read's own write for the same id silently no-op. Set (never reset) by
                    // ANY of the three, regardless of outcome, once such a command exists anywhere in
                    // the run.
                    let hasMutation = false;
                    // "Is id being mutated?" is asked of TanStack's own MutationCache
                    // (`src/internal/recordMutations.ts`'s `canWrite`), scoped: a mutation only counts
                    // against a read whose CURRENT `dependsOn()` matches the scope the mutation itself
                    // captured at start (`meta.scope`). A `switchDependsOn` to a genuinely new scope
                    // therefore already makes a stale mutation stop blocking on its own (doubly so:
                    // `scopeRegistry.isLive` also refuses to store for an abandoned scope at all). But
                    // `resetRecords()`/`resetAll()` touch only the query cache, never the
                    // MutationCache and never `dependsOn()` itself, so a mutation already running keeps
                    // the SAME scope across a same-scope reset — `canWrite` still finds it exactly as
                    // before. Chained through TanStack's own `MutationObserver` lifecycle, releasing it
                    // can take more microtask hops than a plain read's, or than a DIFFERENT mutation's
                    // own (fewer hops still pending). So a mutation from an EARLIER epoch — an
                    // abandoned scope, but just as much a resetRecords()/resetAll() within the SAME
                    // scope — can still be found as blocking by `canWrite` — or, with `scheduleCall`
                    // deferring its real server write to release time, still be about to write the
                    // server itself — when a read OR another mutation of the SAME id lands in a LATER
                    // epoch, even though the scheduler already reported that first call's own promise
                    // "resolved". Keyed by `resetEpoch`, not generation, and never reset itself: records
                    // every epoch that has EVER mutated an id, so `checkLanded` (below) can tell "only I
                    // ever touched this id" (safe) from "a mutation from a DIFFERENT epoch could still
                    // be landing" (not).
                    const mutatedInEpochs = new Map<number, Set<number>>();
                    /** `mutatedInEpochs`, for one id and epoch. */
                    const markMutated = (id: number, atEpoch: number): void => {
                        if (!mutatedInEpochs.has(id)) mutatedInEpochs.set(id, new Set());
                        mutatedInEpochs.get(id)!.add(atEpoch);
                    };
                    /**
                     * Invariant 4/5's completeness half: a command's own write (or read) must leave its
                     * id holding exactly what the server has — not merely "if present, correct" (the
                     * soundness loop below only checks THAT), but "present, or absent, exactly as it
                     * should be". Safe to assert only once `id` was touched by exactly ONE command this
                     * generation (nothing else racing IT, `allTouches`), no reset ran since issue
                     * (`resetEpoch`), no eviction was even POSSIBLE this epoch (`noEvictionPossible` —
                     * invariant 3's own exact-bound condition, computed once for the whole epoch), and no
                     * mutation of this id from a DIFFERENT epoch (`mutatedInEpochs`) — for a READ, none at
                     * all; for a MUTATION, none besides its own epoch's.
                     *
                     * @param id - the record id a command settled for
                     * @param epochAtIssue - `resetEpoch` as it was when that command was issued
                     * @param isMutation - true for a create/update/delete's own check
                     * @param noEvictionPossible - this epoch's combined incoming already fit `maxRecords`
                     */
                    const checkLanded = (
                        id: number,
                        epochAtIssue: number,
                        isMutation: boolean,
                        noEvictionPossible: boolean
                    ): void => {
                        if ((allTouches.get(id) ?? 0) !== 1) return; // shared with something else
                        if (resetEpoch !== epochAtIssue) return; // reset since issue: no longer predictable
                        if (!noEvictionPossible) return; // an eviction this epoch could have picked this id
                        const mutatedAt = mutatedInEpochs.get(id);
                        if (mutatedAt) {
                            const elsewhere = [...mutatedAt].some(
                                (epoch) => epoch !== epochAtIssue
                            );
                            if (isMutation ? elsewhere : mutatedAt.size > 0) return;
                        }
                        expect(composable.getRecord(id)).toEqual(server.store.get(id));
                    };

                    for (const command of commandList) {
                        // Snapshot before issuing: if a reset (or a switch) runs later but before THIS
                        // command's own check does, that check compares it against these, not the live
                        // (by-then-moved-on) epoch/generation.
                        const epochAtIssue = resetEpoch;
                        switch (command.kind) {
                            case 'fetchTarget': {
                                // Captured synchronously, in the SAME call as the real server read,
                                // before any OTHER scheduled task's chain can interleave and change
                                // `server.store` — see the file header's "Write timing" and
                                // `scheduleCall`'s own docs. Resolving this later (once everything has
                                // settled, when a LATER-released mutation may have already changed the
                                // server) would misattribute what THIS call actually saw.
                                let captured: { found: boolean } | undefined;
                                const apiCall = scheduleCall(
                                    `fetchTarget(${command.id})`,
                                    command.fail,
                                    () => {
                                        const result = server.get(command.id)();
                                        captured = { found: server.store.has(command.id) };
                                        return result;
                                    }
                                );
                                if (!command.fail) allow(command.id);
                                // 'target' queries ARE in cancelReads's cancel set (see the file header),
                                // which should make a same-id mutation race safe without tracking it here
                                // — but a resetRecords()-heavy sequence racing an update is not covered by
                                // that guard, the same way the R1 delete-specific case isn't. Tracked in
                                // `looseReadTouches` too, same as fetchMultiple/fetchAny, rather than
                                // trying to characterise exactly which fetchTarget/mutation interleavings
                                // are actually safe.
                                bump(looseReadTouches, command.id);
                                bump(allTouches, command.id);
                                const fetchPromise = composable.fetchTarget(apiCall, command.id, {
                                    forced: command.forced
                                });
                                // Fire-and-forget: track() pushes the outcome into `outcomes`,
                                // awaited together at the end of the run (see below).
                                void track(fetchPromise);
                                pendingReads.push({
                                    settled: fetchPromise,
                                    epochAtIssue,
                                    resolve: () => {
                                        // undefined: cancelled before its own apiCall ever ran (see
                                        // pendingReads' own docs) — nothing of this call's landed.
                                        if (!captured) return;
                                        // Nil item (id not found): targetQueryFunction skips the write
                                        // entirely, so this call added nothing, and `id` never lands
                                        // (checkLanded would otherwise wrongly expect its presence).
                                        const { found } = captured;
                                        return {
                                            incoming: found ? 1 : 0,
                                            ids: found ? [command.id] : []
                                        };
                                    }
                                });
                                break;
                            }
                            case 'fetchAll': {
                                // See fetchTarget's own case for why this is captured synchronously,
                                // inside the real call, rather than resolved later.
                                let captured: { ids: number[] } | undefined;
                                const apiCall = scheduleCall('fetchAll()', command.fail, () => {
                                    const result = server.list()();
                                    captured = { ids: server.store.keys().toArray() };
                                    return result;
                                });
                                // fetchAll can return ANY id the model ever creates, and which ones
                                // depends on server state at RELEASE time (see scheduleCall) — not
                                // known yet at issue time. Bumped broadly, over the whole id space, so
                                // every other command's own touch count is final before any check runs
                                // (see allTouches/checkLanded); the precise ids it actually landed are
                                // read from `captured` instead.
                                for (const id of ID_SPACE) bump(allTouches, id);
                                const fetchPromise = composable.fetchAll(apiCall);
                                void track(fetchPromise);
                                pendingReads.push({
                                    settled: fetchPromise,
                                    epochAtIssue,
                                    resolve: () => {
                                        // undefined: cancelled before its own apiCall ever ran (see
                                        // pendingReads' own docs) — nothing of this call's landed.
                                        if (!captured) return;
                                        const { ids } = captured;
                                        allowAll(ids);
                                        return { incoming: ids.length, ids };
                                    }
                                });
                                break;
                            }
                            case 'fetchMultiple': {
                                // See fetchTarget's own case for why this is captured synchronously,
                                // inside the real call, rather than resolved later.
                                let captured: { found: number[] } | undefined;
                                const apiCall = scheduleCall(
                                    `fetchMultiple(${command.ids.join(',')})`,
                                    command.fail,
                                    () => {
                                        const result = server.many(command.ids)();
                                        captured = {
                                            found: command.ids.filter((id) => server.store.has(id))
                                        };
                                        return result;
                                    }
                                );
                                if (!command.fail) allowAll(command.ids);
                                for (const id of command.ids) {
                                    bump(looseReadTouches, id);
                                    bump(allTouches, id);
                                }
                                const fetchPromise = composable.fetchMultiple(apiCall, command.ids);
                                void track(fetchPromise);
                                pendingReads.push({
                                    settled: fetchPromise,
                                    epochAtIssue,
                                    resolve: () => {
                                        // Only ids the server actually has count as this call's own
                                        // incoming batch (fakeServer's `many` drops the rest, same as
                                        // storeBatch does for a real nil answer). `ids` (for checkLanded
                                        // and contributedIds) is deduplicated, since the final cache has
                                        // one entry per id — but `incoming` (for the bound below) is NOT:
                                        // storeBatch's own `added` count is computed by filtering the
                                        // RAW answer array against "not cached yet", so a requested id
                                        // repeated twice (e.g. ids: [1, 3, 1]) is counted twice there,
                                        // the same way two SEPARATE reads of one new id would be — even
                                        // though only one entry survives.
                                        // undefined: cancelled before its own apiCall ever ran (see
                                        // pendingReads' own docs) — nothing of this call's landed.
                                        if (!captured) return;
                                        const { found } = captured;
                                        return { incoming: found.length, ids: [...new Set(found)] };
                                    }
                                });
                                break;
                            }
                            case 'createTarget': {
                                const data = {
                                    id: command.id,
                                    name: 'New',
                                    email: 'new@example.com'
                                };
                                const apiCall = scheduleCall(
                                    `createTarget(${command.id})`,
                                    command.fail,
                                    () => server.create(data)()
                                );
                                if (!command.fail) allow(command.id);
                                bump(mutationTouches, command.id);
                                markMutated(command.id, epochAtIssue);
                                bump(allTouches, command.id);
                                hasMutation = true;
                                const dummy = command.withDummy
                                    ? ({ ...data } as IUser)
                                    : undefined;
                                const mutationPromise = composable.createTarget(apiCall, dummy);
                                mutationChecks.push({
                                    outcome: track(mutationPromise),
                                    expectFail: command.fail
                                });
                                pendingMutations.push({
                                    settled: mutationPromise,
                                    epochAtIssue,
                                    id: command.id,
                                    kind: 'create'
                                });
                                break;
                            }
                            case 'updateTarget': {
                                const patch = { name: 'Updated' };
                                const apiCall = scheduleCall(
                                    `updateTarget(${command.id})`,
                                    command.fail,
                                    () => server.update(command.id, patch)()
                                );
                                if (!command.fail) allow(command.id);
                                bump(mutationTouches, command.id);
                                markMutated(command.id, epochAtIssue);
                                bump(allTouches, command.id);
                                hasMutation = true;
                                const mutationPromise = composable.updateTarget(
                                    apiCall,
                                    patch,
                                    command.id,
                                    { merge: command.merge }
                                );
                                mutationChecks.push({
                                    outcome: track(mutationPromise),
                                    expectFail: command.fail
                                });
                                pendingMutations.push({
                                    settled: mutationPromise,
                                    epochAtIssue,
                                    id: command.id,
                                    kind: 'update'
                                });
                                break;
                            }
                            case 'deleteTarget': {
                                const apiCall = scheduleCall(
                                    `deleteTarget(${command.id})`,
                                    command.fail,
                                    () => server.remove(command.id)()
                                );
                                bump(mutationTouches, command.id);
                                markMutated(command.id, epochAtIssue);
                                bump(allTouches, command.id);
                                hasMutation = true;
                                const mutationPromise = composable.deleteTarget(
                                    apiCall,
                                    command.id
                                );
                                mutationChecks.push({
                                    outcome: track(mutationPromise),
                                    expectFail: command.fail
                                });
                                pendingMutations.push({
                                    settled: mutationPromise,
                                    epochAtIssue,
                                    id: command.id,
                                    kind: 'delete'
                                });
                                break;
                            }
                            case 'resetRecords': {
                                composable.resetRecords();
                                resetEpoch += 1;
                                everReset = true;
                                break;
                            }
                            case 'resetAll': {
                                composable.resetAll();
                                resetEpoch += 1;
                                everReset = true;
                                break;
                            }
                            case 'switchDependsOn': {
                                scopeState.value += 1;
                                generation += 1;
                                idsByGeneration.set(generation, new Set());
                                mutationTouches.clear();
                                looseReadTouches.clear();
                                allTouches.clear();
                                // A scope switch drops the old scope's queries too (`keys.isCurrent`
                                // refuses a stale write) — same "nothing pending is predictable any
                                // more" effect as resetRecords/resetAll, so it bumps the same epoch.
                                resetEpoch += 1;
                                everReset = true;
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

                    // Resolve every pending read/mutation now that everything has settled (see the file
                    // header): only a command that actually landed (resolved — `fail`, or a cancellation
                    // confirming nothing of its own, both settle as a rejection here) contributes.
                    const landedReads: {
                        epochAtIssue: number;
                        incoming: number;
                        ids: number[];
                    }[] = [];
                    for (const read of pendingReads) {
                        const ok = await read.settled.then(
                            () => true,
                            () => false
                        );
                        if (!ok) continue;
                        const resolved = read.resolve();
                        if (!resolved) continue; // cancelled before its own apiCall ever ran
                        const { incoming, ids } = resolved;
                        landedReads.push({
                            epochAtIssue: read.epochAtIssue,
                            incoming,
                            ids
                        });
                    }
                    const landedMutations: {
                        epochAtIssue: number;
                        id: number;
                        kind: 'create' | 'update' | 'delete';
                    }[] = [];
                    for (const mutation of pendingMutations) {
                        const ok = await mutation.settled.then(
                            () => true,
                            () => false
                        );
                        if (ok) landedMutations.push(mutation);
                    }

                    // Invariant 3 — computed over the CURRENT epoch only (see resetEpoch, above): an
                    // abandoned epoch's own reads say nothing about the CURRENT one's bound. Meaningful
                    // only for a PURE-READS epoch (`hasMutation`, see its own docs for why a create,
                    // update or delete anywhere breaks both bounds below), with no reset/switch since
                    // (`everReset` — a reset has no guard against a stale-epoch read's effect landing,
                    // padding the total, after it), and with every contributed id touched exactly once,
                    // anywhere in the epoch (`allTouches`): `enforceMaxRecords` only runs for a
                    // "genuinely new" id — `getQueryData(targetKey)?.data === undefined` — so which of an
                    // id's several touches counts as "the genuinely new one" (the rest are free bypasses
                    // that enforce nothing) depends on release order, and a bypass landing after an
                    // UNRELATED wipe can make the same id "genuinely new" again.
                    const inCurrentEpoch = (epochAtIssue: number): boolean =>
                        epochAtIssue === resetEpoch;
                    const currentReads = landedReads.filter((read) =>
                        inCurrentEpoch(read.epochAtIssue)
                    );
                    let maxReadIncoming = 0;
                    for (const read of currentReads)
                        maxReadIncoming = Math.max(maxReadIncoming, read.incoming);
                    const contributedIds = new Set<number>();
                    for (const read of currentReads)
                        for (const id of read.ids) contributedIds.add(id);
                    const settledIds = [...contributedIds];
                    const anyContributedIdContested = settledIds.some(
                        (id) => (allTouches.get(id) ?? 0) > 1
                    );
                    const boundsAreMeaningful =
                        !everReset && !hasMutation && !anyContributedIdContested;
                    if (boundsAreMeaningful) {
                        // Upper bound: the loosest ceiling that's ALWAYS safe, regardless of release
                        // order (see the file header) — the biggest single read's own batch.
                        expect(composable.itemList.value.length).toBeLessThanOrEqual(
                            Math.max(maxRecords, maxReadIncoming)
                        );
                    }
                    // Exact bound: the GATE is the RAW sum of incoming, duplicates included — NOT
                    // settledIds.length (deduplicated): storeBatch's own `added` count (what
                    // enforceMaxRecords actually compares against maxRecords) is computed from the raw
                    // answer array, so a read requesting one id twice (fetchMultiple's own ids:
                    // [1, 1, 3]) contributes 2 to a wipe check that only ever nets 1 surviving entry.
                    // Summing the raw per-read values is the safe (if sometimes overcautious) upper bound
                    // on what any release order could have compared against maxRecords — if that sum
                    // already fits, no read's own wipe check could ever have fired, in any order, so the
                    // total must be exactly the settled (deduplicated) set's size. This is what catches a
                    // wipe that fires one record too early (see the file header) — the hollow version
                    // could never fail on it, since it only ever REMOVES a record, never adds one beyond
                    // what an upper bound allows.
                    let sumRawIncoming = 0;
                    for (const read of currentReads) sumRawIncoming += read.incoming;
                    const noEvictionPossible = boundsAreMeaningful && sumRawIncoming <= maxRecords;
                    if (noEvictionPossible)
                        expect(composable.itemList.value.length).toBe(settledIds.length);

                    // Invariant 4/5's completeness half (checkLanded) — needs the aggregates just
                    // computed above, so it runs here rather than inline with each command.
                    for (const mutation of landedMutations)
                        checkLanded(mutation.id, mutation.epochAtIssue, true, noEvictionPossible);
                    for (const read of landedReads)
                        for (const id of read.ids)
                            checkLanded(id, read.epochAtIssue, false, noEvictionPossible);

                    // Invariant 2 — once everything has settled, nothing is still "loading".
                    expect(composable.isLoading()).toBe(false);

                    // Invariants 4 & 5, soundness half — everything CACHED is legitimate: no id from
                    // a stale scope, no deleted id back. `checkLanded`, above, is the completeness
                    // half (everything that SHOULD be cached, checked once settled, actually is); this
                    // loop only visits ids already present, so it says nothing on its own about a
                    // missing one — that's exactly what `checkLanded` is for.
                    const allowedIds = idsByGeneration.get(generation)!;
                    const touchedIds = new Set([
                        ...mutationTouches.keys(),
                        ...looseReadTouches.keys()
                    ]);
                    // Covers the R1 race too (see the file header): fetchTarget bumps `looseReadTouches`
                    // for its own id the same as fetchMultiple/fetchAny do, so an id both a fetchTarget
                    // and a deleteTarget touch is already contested here — no separate tracking needed.
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
                        // A mutation's own completeness is `checkLanded`'s job (above), which pins its
                        // check to the instant its own scope was still current. Here, an id mutated in an
                        // ABANDONED epoch is skipped too, but only when something in the CURRENT one ALSO
                        // touches it (`allTouches`, cleared each switch — but NOT each reset, so a nonzero
                        // count here can still span a resetRecords()/resetAll() within this generation):
                        // `canWrite` (src/internal/recordMutations.ts), whose real release is deferred
                        // along with the mutation's write (see scheduleCall), can still be blocking (or
                        // letting through) that OTHER command's own write for as long as it shares the
                        // mutation's OWN scope — which a same-scope resetRecords()/resetAll() does not
                        // change (see `hasMutation`'s own comment, above, for why). Keyed by `resetEpoch`,
                        // not generation, for exactly that reason: a resetRecords()/resetAll() clears
                        // nothing `canWrite` looks at, so the SAME hazard applies within one generation
                        // too — `[updateTarget(id), resetAll(), fetchTarget(id)]` can land the read's OWN
                        // stale answer instead of the update's if the update is still `canWrite`-blocking
                        // when the read's own check runs. An id mutated ONLY in an old epoch, with NOTHING
                        // in the current one ever referencing it, has no such excuse: its mere presence
                        // here — the "still holds what this call wrote" check in `resourceMutations.ts`'s
                        // `onSuccess`/`onError` exists specifically to prevent it — is real.
                        const mutatedElsewhere = [...(mutatedInEpochs.get(id) ?? [])].some(
                            (epoch) => epoch !== resetEpoch
                        );
                        if (mutatedElsewhere && (allTouches.get(id) ?? 0) > 0) continue;
                        expect(allowedIds.has(id)).toBe(true);
                        expect(server.store.has(id)).toBe(true);
                        expect(composable.itemDictionary.value[id]).toEqual(server.store.get(id));
                    }

                    clearAllInstances();
                }
            ),
            // FC_NUM_RUNS, read the same way tests/_setup/fastCheck.ts does; this file's own default
            // (25) is lower than the global one (50) — see the file header's "Run count".
            { numRuns: Number(process.env.FC_NUM_RUNS ?? 25) }
        );
    }, 20_000);
});
