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
 *
 * The export list only proves the NAMES survived the build — a composable that throws the moment
 * it runs would still list its own name here. So this also actually CALLS two composables against
 * the real `dist` build and checks what comes back, cheaply: one round-trip each, no fake server.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { effectScope } from 'vue';
import { QueryClient } from '@tanstack/vue-query';

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

const { useStructureDataManagement, useStructureRestApi } = packageExports;

// Vue: an effectScope stands in for a component's setup() so the cache subscriptions both
// composables make below have somewhere to be torn down — dropping it would warn (see
// restResource.ts) and leak, not fail this smoke test, so it's still worth doing right.
const dataManagementScope = effectScope();
const dataManagement = dataManagementScope.run(() => useStructureDataManagement());
dataManagement.addRecord({ id: 1, name: 'Ada' });
if (dataManagement.getRecord(1)?.name !== 'Ada') {
    console.error(
        'tests/package/smoke.mjs: useStructureDataManagement did not round-trip addRecord/getRecord'
    );
    process.exit(1);
}
dataManagementScope.stop();

const restScope = effectScope();
// An explicit QueryClient, no VueQueryPlugin/injection — this script is not a Vue app.
const queryClient = new QueryClient();
const rest = restScope.run(() => useStructureRestApi({ resourceKey: 'smoke-users', queryClient }));
const fetched = await rest.fetchTarget(() => Promise.resolve({ id: 1, name: 'Ada' }), 1);
if (fetched?.name !== 'Ada' || rest.getRecord(1)?.name !== 'Ada') {
    console.error(
        'tests/package/smoke.mjs: useStructureRestApi did not fetch/store a record through fetchTarget'
    );
    process.exit(1);
}
restScope.stop();
queryClient.clear();

console.log(`tests/package/smoke.mjs: OK — ${actual.length} exports match exports.json`);
