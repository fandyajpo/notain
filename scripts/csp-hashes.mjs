/**
 * Post-build: stamp the sha256 hashes of every inline <script> in `dist/`
 * into the CSP in `dist/_headers`.
 *
 * Astro inlines its island runtime (the `astro-island` custom element and its
 * helpers) as classic `<script>(()=>{...})()</script>` on every page that
 * hydrates anything. An enforcing CSP without those hashes kills hydration on
 * every island — and the exact bytes change whenever Astro upgrades, so the
 * hashes cannot be hand-maintained. `public/_headers` therefore carries a
 * `__CSP_SCRIPT_HASHES__` placeholder that this script replaces after every
 * build, keeping the shipped header provably in sync with the shipped HTML.
 *
 * Runs last in the `build` script in package.json — never `astro build` alone,
 * or `dist/_headers` keeps the placeholder.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const DIST = path.resolve(process.cwd(), 'dist');
const PLACEHOLDER = '__CSP_SCRIPT_HASHES__';

/** Inline scripts only: a `src=` script is external, an empty body has nothing to hash. */
const INLINE_SCRIPT = /<script([^>]*)>([\s\S]*?)<\/script>/gi;

async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

const pages = (await walk(DIST)).filter((file) => file.endsWith('.html'));
const hashes = new Set();

for (const page of pages) {
  const html = await readFile(page, 'utf8');
  for (const match of html.matchAll(INLINE_SCRIPT)) {
    if (/\ssrc\s*=/i.test(match[1])) continue;
    const source = match[2];
    if (source.trim() === '') continue;
    // The browser hashes the raw script text exactly as it appears in the
    // document, so the digest is taken from the same bytes.
    const digest = createHash('sha256').update(source, 'utf8').digest('base64');
    hashes.add(`'sha256-${digest}'`);
  }
}

const headersPath = path.join(DIST, '_headers');
const headers = await readFile(headersPath, 'utf8');
if (!headers.includes(PLACEHOLDER)) {
  console.error(
    `csp-hashes: ${PLACEHOLDER} tidak ada di dist/_headers — tambahkan placeholder itu di script-src (public/_headers).`,
  );
  process.exit(1);
}

const stamped = [...hashes]
  .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  .join(' ');
await writeFile(headersPath, headers.replaceAll(PLACEHOLDER, stamped));

console.log(`csp-hashes: ${hashes.size} hash inline script di-stamp di dist/_headers`);
