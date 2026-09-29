---
source: tests/_setup/fastCheck.ts
sha256: 2110b30ab7d98a3390686388be6e65d92de41799f072397cb09f9b50ddc8773a
generated_at: 2026-09-28T22:38:46.677061+00:00
model: ollama:qwen3.8:27b
---

# tests/_setup/fastCheck.ts

## Purpose

Global fast-check configuration applied once before any `*.property.spec.ts` file loads fast-check. It reads environment variables to control run count and (optionally) fix the random seed, so property-based tests are fast by default and reproducible on demand.

## Key elements

- **`fc.configureGlobal({ numRuns, seed? })`** — the sole action in the file. Sets the number of property-test runs (`FC_NUM_RUNS`, default **50**) and, when `FC_SEED` is present in the environment, pins the RNG seed so a single run (including shrinking) is deterministic.
- **`seed`** — local const derived from `process.env.FC_SEED`. Spreads into the config object only when defined, avoiding a `seed: undefined` key.

## Relationships

No dependency-graph neighbors are recorded for this file. It is wired in exclusively through the Jest `setupFiles` entry in `jest.config.cjs`, which loads it before any spec file resolves the `fast-check` import.

## Notes

- Because this file runs in a **separate module scope** from the spec files (it is a setup file, not imported by them), the `fc.configureGlobal` call mutates fast-check's module-level singleton _before_ the specs import `fc`. Do not replace it with a per-test `beforeAll` call—order matters.
- `FC_NUM_RUNS` is read at module-evaluation time. Changing it requires a fresh Jest process (i.e., a new `npx jest` invocation), not a hot reload.
- The comment in the file references `docs/guide/testing.md` for the seed-replay workflow: a failed property test prints its own seed; rerun with `FC_SEED=<that seed>` to reproduce exactly.
