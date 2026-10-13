/**
 * Post-build: give every page a `<link rel="modulepreload">` for each island's
 * static dependency graph.
 *
 * Astro's island hydrator does `Promise.all([import(component), import(renderer)])`
 * from an inline script, so nothing downloads until the component chunk has
 * arrived — and that chunk's own static imports wait another round trip behind
 * it. Measured on this repo before the fix: zero modulepreload links across all
 * 15 pages, with several hundred kB of JS reachable from the first one.
 *
 * This walks each page's islands, follows the `import "./chunk.js"` edges the
 * bundler emitted (dynamic `import("./x.js")` calls never match — those are the
 * lazy paths, and they stay lazy), and injects the result into `<head>`.
 *
 * Runs after `astro build`, wired into the `build` script in package.json.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DIST = path.resolve(process.cwd(), 'dist');

/** Static edges only: `import"./a.js"`, `from "./a.js"`, `export*from"./a.js"`. */
const STATIC_IMPORT = /(?:import|from|export)\s*["']([^"']+)["']/g;

const toHref = (file) => `/${path.relative(DIST, file).split(path.sep).join('/')}`;
const inDist = (file) => file.startsWith(`${DIST}${path.sep}`);

async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

/** Every statically reachable `.js` chunk from `entry`, `entry` included. */
async function graphOf(entry) {
  const seen = new Set();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);

    let source;
    try {
      source = await readFile(file, 'utf8');
    } catch {
      continue; // A stale href in the HTML is not worth failing the build over.
    }

    for (const match of source.matchAll(STATIC_IMPORT)) {
      const spec = match[1];
      if (!spec.startsWith('.')) continue;
      const resolved = path.resolve(path.dirname(file), spec);
      if (inDist(resolved) && resolved.endsWith('.js')) queue.push(resolved);
    }
  }

  return [...seen].map(toHref);
}

const pages = (await walk(DIST)).filter((file) => file.endsWith('.html'));
let linked = 0;
let links = 0;

for (const page of pages) {
  const html = await readFile(page, 'utf8');
  const entries = [...html.matchAll(/(?:component|renderer)-url="([^"]+\.js)"/g)].map((match) =>
    path.join(DIST, match[1].replace(/^\/+/, '')),
  );

  if (entries.length === 0) continue;

  const hrefs = new Set();
  for (const entry of entries) {
    for (const href of await graphOf(entry)) {
      if (!html.includes(`href="${href}"`)) hrefs.add(href);
    }
  }
  if (hrefs.size === 0) continue;

  const tags = [...hrefs]
    .sort()
    .map((href) => `<link rel="modulepreload" href="${href}">`)
    .join('');

  await writeFile(page, html.replace(/<\/head>/i, `${tags}</head>`));
  linked += 1;
  links += hrefs.size;
}

console.log(`modulepreload: ${links} link di ${linked}/${pages.length} halaman`);
