/**
 * Global fast-check configuration for every `*.property.spec.ts` file, loaded once via
 * `setupFiles` (jest.config.cjs) — before fast-check itself is imported by any spec.
 *
 * `FC_NUM_RUNS` (default 50) keeps `npm test` fast; crank it locally when hunting a rare
 * counterexample: `FC_NUM_RUNS=1000 npx jest property`. `FC_SEED`, when set, replays one exact
 * run (see docs/guide/testing.md — a failure always prints its own `seed` and `path`, which
 * reproduce it directly in `fc.assert` without touching this file).
 */
import fc from 'fast-check';

const seed = process.env.FC_SEED ? Number(process.env.FC_SEED) : undefined;

fc.configureGlobal({
    numRuns: Number(process.env.FC_NUM_RUNS ?? 50),
    ...(seed === undefined ? {} : { seed })
});
