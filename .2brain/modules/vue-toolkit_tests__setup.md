---
tags:
    - 2brain
    - 2brain/module
    - project/vue-toolkit
type: module
module: tests/_setup/
files: 1
updated: 2026-09-28T23:19:05.421659+00:00
---

# tests/_setup/

## Purpose

`tests/_setup/` contains global, one-time configuration that runs before any property-based test files are loaded. Its sole responsibility is to establish fast-check runtime settings (iteration count, optional fixed seed) from environment variables so that `*.property.spec.ts` suites are fast by default and reproducible when a developer opts in.

## Key parts

- **`fastCheck.ts`** – Registers a global fast-check configuration. Reads environment variables to set the default run count (keeping CI and local runs quick) and, if a seed variable is present, pins the PRNG so failing property tests can be reproduced deterministically.

## How it connects

This module has no listed dependencies and is not imported by other modules in the graph. It acts as a pre-test bootstrap: the test runner loads it ahead of every `*.property.spec.ts` file, so its effect is visible to all property-based tests without them importing anything explicitly.

## Where to start

Open **`tests/_setup/fastCheck.ts`**. It is the only file in the module and is short; reading it tells you exactly which environment variables control test speed and reproducibility, and how to use them when debugging a flaky property test.

## Connected modules

_(none)_

## Files

- `tests/_setup/fastCheck.ts` — Global fast-check configuration applied once before any `*.property.spec.ts` file loads fast-check. It reads environment variables to control run count and (optionally) fix the random seed, so property-based tests are fast by default and reproducible on demand.

---

[[vue-toolkit_INDEX|← vue-toolkit index]]
