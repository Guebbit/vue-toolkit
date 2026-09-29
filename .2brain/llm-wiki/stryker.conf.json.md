---
source: stryker.conf.json
sha256: 04ce8ba5150f822ba9e088d7f9611216df9cbf84dc376b2ffabd056b76c76e12
generated_at: 2026-09-28T22:38:37.490236+00:00
model: ollama:qwen3.8:27b
---

# stryker.conf.json

## Purpose

Configuration file for [Stryker](https://stryker-mutator.io/), the mutation-testing framework. It defines which source files are mutated, how tests are executed against the mutants, how results are reported, and what score thresholds gate CI.

## Key elements

- **`mutate`** — Glob pattern selecting mutation targets: all `src/**/*.ts` except `src/index.ts`.
- **`testRunner` / `jest`** — Declares Jest as the test runner with a _custom_ project type, pointing at `jest.config.cjs`. `enableFindRelatedTests` lets Stryker skip tests unrelated to a given mutant for speed.
- **`coverageAnalysis: "perTest"`** — Runs coverage per individual test (rather than the whole suite) so Stryker can match coverage to specific tests and prune irrelevant ones.
- **`reporters`** — Outputs HTML, clear-text, and progress reporters.
- **`htmlReporter.fileName`** — Writes the HTML report to `reports/mutation/mutation.html`.
- **`thresholds`** — `high: 90`, `low: 80`, `break: 88`. The `break` value causes the process to exit non-zero if the mutation score drops below 88.
- **`concurrency: 4`** — Runs up to 4 mutants in parallel.
- **`timeoutMS: 20000`** — 20-second per-mutant test timeout.
- **`packageManager`** — Set to `npm` (Stryker uses this to resolve/execute test commands).
- **`$schema`** — Points to the local Stryker schema for editor autocomplete/validation.

## Relationships

No graph neighbors are recorded for this file. It is a standalone configuration consumed by the Stryker CLI; it references `jest.config.cjs` and the `src/` tree as targets but does not import them programmatically.

## Notes

- `src/index.ts` is deliberately excluded from mutation (likely a thin re-export barrel).
- The `break` threshold (88) sits _between_ `high` and `low`, meaning CI fails at < 88 but a score of 88–90 is still reported as acceptable.
- `projectType: "custom"` means Stryker will not auto-detect the Jest setup; the referenced `jest.config.cjs` is the single source of truth for test discovery.
