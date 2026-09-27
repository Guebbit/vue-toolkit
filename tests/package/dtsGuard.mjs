#!/usr/bin/env node
/**
 * Guards the published `.d.ts` files against two ways they can quietly stop resolving for a
 * consumer.
 *
 * `zod` is an OPTIONAL peer: an app without it installed must still type-check against this
 * package's types, so no `.d.ts` may import it — checked everywhere.
 *
 * The PUBLIC surface (`index.d.ts`, `composables/*.d.ts`, `stores/*.d.ts` — everything a
 * consumer's own `tsc` actually resolves) must never import `@vue/reactivity`/`@vue/shared`
 * (Vue's internal packages, which `ReturnType<typeof ...>` on a composable can pull in, and which
 * do not resolve under a strict, pnpm-style `node_modules` layout) or this package's own
 * `internal/` modules (never meant to be part of the public API — see CLAUDE.md). `internal/**`
 * itself is exempt: those files reference each other and Vue's internals freely, and a consumer
 * never resolves them directly.
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const distTypesRoot = fileURLToPath(new URL('../../dist/types', import.meta.url));

/** Checked in every published `.d.ts` file. */
const ALWAYS_FORBIDDEN = [
    { pattern: /\bfrom ['"]zod['"]|import\(['"]zod['"]\)/, reason: 'zod is an optional peer' }
];

/** Checked only outside `internal/` — the surface a consumer's `tsc` actually resolves. */
const PUBLIC_SURFACE_FORBIDDEN = [
    {
        pattern:
            /\bfrom ['"]@vue\/(reactivity|shared)['"]|import\(['"]@vue\/(reactivity|shared)['"]\)/,
        reason: "Vue's internal packages don't resolve under a strict node_modules layout"
    },
    {
        pattern: /\bfrom ['"][.\w/]*\/internal\/|import\(['"][.\w/]*\/internal\//,
        reason: 'internal/ is not public API'
    }
];

const entries = await readdir(distTypesRoot, { withFileTypes: true, recursive: true });
const dtsFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.d.ts'));

const offenders = [];
for (const entry of dtsFiles) {
    const relativePath =
        `${entry.parentPath.slice(distTypesRoot.length + 1)}/${entry.name}`.replace(/^\//, '');
    const content = await readFile(`${entry.parentPath}/${entry.name}`, 'utf8');
    const rules = relativePath.startsWith('internal/')
        ? ALWAYS_FORBIDDEN
        : [...ALWAYS_FORBIDDEN, ...PUBLIC_SURFACE_FORBIDDEN];
    for (const { pattern, reason } of rules)
        if (pattern.test(content)) offenders.push(`  dist/types/${relativePath} — ${reason}`);
}

if (offenders.length > 0) {
    console.error('tests/package/dtsGuard.mjs: forbidden reference(s) in the published types:');
    console.error(offenders.join('\n'));
    process.exit(1);
}

console.log('tests/package/dtsGuard.mjs: OK — no forbidden references in the published types');
