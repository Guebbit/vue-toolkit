#!/usr/bin/env node
/**
 * Plain-Node smoke test for the built package: no bundler, no ts-jest transform, no
 * moduleNameMapper — just what a consumer's own `node -e "require('@guebbit/vue-toolkit')"` (or a
 * bundler-free SSR runtime) actually sees.
 *
 * Imports the package by its own name, which Node resolves through `package.json#exports` (the
 * self-reference feature: a package importing itself the way any consumer would), so this loads
 * the built `dist`, not `src`. A `dist` with broken relative imports fails right here.
 *
 * The export list doubles as the public-API guard: `exports.json` is the frozen list of runtime
 * exports. Removing one fails this script, forcing a deliberate edit to that list plus a
 * **BREAKING** CHANGELOG line — the same discipline as any other semver break.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const expectedPath = fileURLToPath(new URL('./exports.json', import.meta.url));
const expected = JSON.parse(await readFile(expectedPath, 'utf8'));

const packageExports = await import('@guebbit/vue-toolkit');
const actual = Object.keys(packageExports).sort();
const expectedSorted = [...expected].sort();

const missing = expectedSorted.filter((name) => !actual.includes(name));
const added = actual.filter((name) => !expectedSorted.includes(name));

if (missing.length > 0 || added.length > 0) {
    console.error('tests/package/smoke.mjs: the built package exports do not match exports.json');
    if (missing.length > 0) console.error('  missing (removed from dist):', missing.join(', '));
    if (added.length > 0)
        console.error(
            '  added (not in exports.json — update the list, and add a CHANGELOG line if intentional):',
            added.join(', ')
        );
    process.exit(1);
}

console.log(`tests/package/smoke.mjs: OK — ${actual.length} exports match exports.json`);
