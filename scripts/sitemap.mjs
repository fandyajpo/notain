/**
 * Post-build: write `dist/sitemap.xml` from the pages that actually shipped.
 *
 * The sitemap is derived from the HTML rather than from a hand-maintained list
 * of routes: a page earns an entry only if it carries both a canonical URL and
 * an indexable robots directive. That makes it impossible for the sitemap to
 * advertise a private screen — the two are produced by the same pass through
 * `src/lib/seo.ts` — and it keeps working when a route is added without
 * anyone remembering to touch this file.
 *
 * Runs in the `build` script in package.json, after `astro build` (which
 * emits the HTML) and before `csp-hashes.mjs` (which must see the final
 * documents).
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DIST = path.resolve(process.cwd(), 'dist');
const OUT = path.join(DIST, 'sitemap.xml');

const TAG = /<(?:link|meta)\b[^>]*>/gi;

/** Attribute value out of a tag, tolerant of attribute order. */
const attrOf = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'))?.[1];

const escapeXml = (value) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
const urls = new Set();

for (const page of pages) {
  const html = await readFile(page, 'utf8');
  let canonical;
  let robots;

  for (const tag of html.match(TAG) ?? []) {
    const rel = attrOf(tag, 'rel');
    const name = attrOf(tag, 'name');
    if (rel === 'canonical' && !canonical) canonical = attrOf(tag, 'href');
    if (name === 'robots' && !robots) robots = attrOf(tag, 'content');
  }

  if (!canonical || !robots) continue;
  if (/noindex/i.test(robots)) continue;
  if (!/index/i.test(robots)) continue;
  urls.add(canonical);
}

const sorted = [...urls].sort();
const body = sorted.map((loc) => `  <url><loc>${escapeXml(loc)}</loc></url>`).join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;

await writeFile(OUT, xml);
console.log(`sitemap: ${sorted.length} URL di dist/sitemap.xml`);
