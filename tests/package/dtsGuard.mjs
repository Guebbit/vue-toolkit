#!/usr/bin/env node
/**
 * Guards the published `.d.ts` files against referencing a module a consumer might not have.
 *
 * `zod` is an OPTIONAL peer: an app without it installed must still type-check against this
 * package's types. `tsc` happily emits an `import('zod')` type reference for anything derived
 * from a Zod type, and that reference does not resolve without the optional peer — this catches
 * it before it ships, rather than in a consumer's build.
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const distTypesRoot = fileURLToPath(new URL('../../dist/types', import.meta.url));

/** Substrings a published `.d.ts` must never contain, and why. */
const FORBIDDEN = [
    { pattern: /\bfrom ['"]zod['"]|import\(['"]zod['"]\)/, reason: 'zod is an optional peer' }
];

const entries = await readdir(distTypesRoot, { withFileTypes: true, recursive: true });
const dtsFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.d.ts'));

const offenders = [];
for (const entry of dtsFiles) {
    const relativePath =
        `${entry.parentPath.slice(distTypesRoot.length + 1)}/${entry.name}`.replace(/^\//, '');
    const content = await readFile(`${entry.parentPath}/${entry.name}`, 'utf8');
    for (const { pattern, reason } of FORBIDDEN)
        if (pattern.test(content)) offenders.push(`  dist/types/${relativePath} — ${reason}`);
}

if (offenders.length > 0) {
    console.error('tests/package/dtsGuard.mjs: forbidden reference(s) in the published types:');
    console.error(offenders.join('\n'));
    process.exit(1);
}

console.log('tests/package/dtsGuard.mjs: OK — no forbidden references in the published types');
