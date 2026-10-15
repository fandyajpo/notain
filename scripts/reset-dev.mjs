#!/usr/bin/env node
/**
 * Wipes the Notain Appwrite project clean: every row in every table, and —
 * with `--users` — every auth account too, so a fresh registration can start
 * from zero.
 *
 * Admin-only, so it needs an API key (Settings → API keys) with:
 *   collections.read, documents.read, documents.write, users.read, users.delete
 *
 * Put the key in `.env` as `APPWRITE_API_KEY=` (git-ignored — never commit it,
 * never paste it in chat). Revoke the key when you are done.
 *
 * Usage:
 *   npm run reset:dev                   # dry-run: show what would be wiped
 *   npm run reset:dev -- --yes          # wipe every row
 *   npm run reset:dev -- --yes --users  # wipe rows AND every auth user
 *
 * Deletion runs DELETEs in parallel (8 in flight per table) — Appwrite has no
 * bulk-delete endpoint, so concurrency is what keeps a big wipe quick.
 */

const TABLES = ['profiles', 'invoices', 'templates', 'customers', 'stats'];
const PAGE_SIZE = 100;
/** Appwrite has no bulk-delete: throughput comes from parallel DELETEs per page. */
const DELETE_CONCURRENCY = 8;
/** Refuse to loop forever if something upstream keeps re-creating rows. */
const MAX_DELETES = 100_000;

const endpoint = (
  process.env.PUBLIC_APPWRITE_ENDPOINT ?? 'https://sgp.cloud.appwrite.io/v1'
).replace(/\/+$/, '');
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID ?? '6aca66fb003071c0ef43';
const databaseId = process.env.PUBLIC_APPWRITE_DATABASE_ID ?? 'notain_db';
const apiKey = (process.env.APPWRITE_API_KEY ?? '').trim();

const args = process.argv.slice(2);
const confirmed = args.includes('--yes');
const alsoUsers = args.includes('--users');

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

if (!apiKey) {
  fail(
    'APPWRITE_API_KEY belum diisi.\n' +
      '  1. Appwrite Console → project ini → Settings → API keys → Create\n' +
      '  2. Centang scope: collections.read, documents.read, documents.write,\n' +
      '     users.read, users.delete\n' +
      '  3. Tambahkan ke .env: APPWRITE_API_KEY=key_...',
  );
}

async function api(method, path) {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(`${endpoint}${path}`, {
      method,
      headers: { 'X-Appwrite-Project': projectId, 'X-Appwrite-Key': apiKey },
    });

    if (response.status === 429 && attempt < 6) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * attempt;
      console.log(`  rate-limited, tunggu ${Math.round(waitMs / 1000)}s…`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    const contentType = response.headers.get('content-type') ?? '';
    const isJson = contentType.includes('application/json');

    if (!response.ok) {
      // A JSON 404 is a real "not found"; an HTML 404 is the router not
      // knowing the path at all, which must never pass as "empty".
      if (response.status === 404 && isJson) return null;
      const body = (await response.text()).slice(0, 200).replace(/\s+/g, ' ');
      throw new Error(`${method} ${path} → ${response.status} ${body}`);
    }
    if (response.status === 204 || !isJson) return null;
    return response.json();
  }
}

/** Runs `task` over `items` with at most `concurrency` in flight. */
async function runPool(items, concurrency, task) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (;;) {
      const item = queue.shift();
      if (item === undefined) return;
      await task(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Always refetches the first page, so no cursor bookkeeping is needed — the
 * rows it deletes are gone before the next round. Each page's DELETEs go out
 * in parallel; a 429 slows the individual request down, not the whole run.
 */
async function wipeList({ listPath, itemKey, deletePath, label }) {
  let deleted = 0;
  for (;;) {
    const page = await api('GET', `${listPath}?limit=${PAGE_SIZE}`);
    const items = page?.[itemKey] ?? [];
    if (items.length === 0) return deleted;

    await runPool(items, DELETE_CONCURRENCY, async (item) => {
      await api('DELETE', deletePath(item.$id));
      deleted += 1;
      if (deleted > MAX_DELETES) fail(`Batas ${MAX_DELETES} terlampaui di ${listPath} — berhenti.`);
    });
    console.log(`  ${label}: ${deleted} terhapus…`);
  }
}

async function count(listPath, itemKey) {
  const page = await api('GET', `${listPath}?limit=1`);
  return page?.total ?? page?.[itemKey]?.length ?? 0;
}

/**
 * Row endpoints on this project are the collections/documents routes (the
 * `/tables/.../rows` paths answer with an HTML 404 from the router).
 */
function collectionPath(tableId, suffix = '') {
  return `/databases/${databaseId}/collections/${tableId}/documents${suffix}`;
}

console.log(`Target: ${endpoint}  project=${projectId}  database=${databaseId}`);

try {
  const rowCounts = [];
  for (const table of TABLES) {
    rowCounts.push([table, await count(collectionPath(table), 'documents')]);
  }
  const userCount = alsoUsers ? await count('/users', 'users') : null;

  console.log('\nYang akan dihapus:');
  for (const [table, total] of rowCounts) console.log(`  rows/${table.padEnd(12)} ${total}`);
  if (alsoUsers) console.log(`  auth users       ${userCount}`);
  else console.log('  auth users       (dilewati — tambah --users kalau mau sekalian)');

  if (!confirmed) {
    console.log('\nDry-run saja. Ulangi dengan `--yes` untuk benar-benar menghapus.');
    process.exit(0);
  }

  for (const [table] of rowCounts) {
    const deleted = await wipeList({
      listPath: collectionPath(table),
      itemKey: 'documents',
      deletePath: (id) => collectionPath(table, `/${encodeURIComponent(id)}`),
      label: `rows/${table}`,
    });
    console.log(`✔ rows/${table}: ${deleted} row dihapus`);
  }

  if (alsoUsers) {
    const deleted = await wipeList({
      listPath: '/users',
      itemKey: 'users',
      deletePath: (id) => `/users/${encodeURIComponent(id)}`,
      label: 'auth users',
    });
    console.log(`✔ auth users: ${deleted} akun dihapus`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('401') || message.includes('403')) {
    fail(
      `API key ditolak (${message.slice(0, 120)}…).\n` +
        '  Pastikan key punya scope: collections.read, documents.read, documents.write, users.read, users.delete',
    );
  }
  fail(message);
}

console.log('\nSelesai. Sekarang cabut (revoke) API key-nya di Console → Settings → API keys.');
