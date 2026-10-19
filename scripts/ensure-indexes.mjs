#!/usr/bin/env node
/**
 * Ensures the Appwrite indexes this app's queries rely on actually exist.
 *
 * Every list query filters on `ownerId`; the invoice list also sorts by
 * `date`, the number allocator scans `invoiceNumber` with `startsWith`, and
 * the search box uses `Query.search`, which *requires* a fulltext index or
 * it errors. Without indexes Appwrite falls back to collection scans, which
 * is fine for a handful of rows and quietly terrible for thousands.
 *
 * Admin-only, so it needs an API key (Settings → API keys) with:
 *   collections.read, collections.write
 *
 * Put the key in `.env` as `APPWRITE_API_KEY=` (git-ignored — never commit it,
 * never paste it in chat). Revoke the key when you are done.
 *
 * Usage:
 *   npm run indexes:ensure            # dry-run: show which indexes exist / would be created
 *   npm run indexes:ensure -- --yes   # create whatever is missing
 *
 * Idempotent: an index that already exists (same key) is skipped, so re-running
 * after a partial failure is safe. Indexes build asynchronously on Appwrite's
 * side — the created status prints as `processing` and settles on its own.
 */

const databaseId = process.env.PUBLIC_APPWRITE_DATABASE_ID ?? 'notain_db';
const endpoint = (
  process.env.PUBLIC_APPWRITE_ENDPOINT ?? 'https://sgp.cloud.appwrite.io/v1'
).replace(/\/+$/, '');
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID ?? '6aca66fb003071c0ef43';
const apiKey = (process.env.APPWRITE_API_KEY ?? '').trim();

/**
 * One entry per collection the app queries. `key` is Appwrite's identifier
 * for the index (used for the exists-check); attribute order matters — the
 * equality filter leads, the sort/prefix attribute follows.
 */
const DESIRED = [
  {
    collectionId: 'invoices',
    indexes: [
      // List: equal(ownerId) + orderDesc(date) + orderDesc($createdAt).
      { key: 'owner_date', type: 'key', attributes: ['ownerId', 'date'], orders: ['asc', 'asc'] },
      // Template filter: equal(ownerId) + equal(templateId) + orderDesc(date).
      {
        key: 'owner_template_date',
        type: 'key',
        attributes: ['ownerId', 'templateId', 'date'],
        orders: ['asc', 'asc', 'asc'],
      },
      // Status filter: equal(ownerId) + equal(status) + orderDesc(date). Serves
      // the /invoices status dropdown and the dashboard stats refresh, which
      // counts each status on every visit.
      {
        key: 'owner_status_date',
        type: 'key',
        attributes: ['ownerId', 'status', 'date'],
        orders: ['asc', 'asc', 'asc'],
      },
      // Number allocation: equal(ownerId) + startsWith('invoiceNumber', 'INV-YYYY-').
      {
        key: 'owner_invoiceNumber',
        type: 'key',
        attributes: ['ownerId', 'invoiceNumber'],
        orders: ['asc', 'asc'],
      },
      // Search box: Query.search on each field (fulltext is mandatory for
      // search). Key names match the ones the Console setup already created,
      // so a re-run recognises them instead of duplicating.
      {
        key: 'invoice_number_fulltext',
        type: 'fulltext',
        attributes: ['invoiceNumber'],
        orders: ['asc'],
      },
      {
        key: 'customer_name_fulltext',
        type: 'fulltext',
        attributes: ['customerName'],
        orders: ['asc'],
      },
      { key: 'items_fulltext', type: 'fulltext', attributes: ['items'], orders: ['asc'] },
    ],
  },
  {
    collectionId: 'customers',
    indexes: [
      // List by owner + the duplicate-name check: equal(ownerId) + equal(name).
      {
        key: 'owner_name',
        type: 'key',
        attributes: ['ownerId', 'name'],
        orders: ['asc', 'asc'],
      },
    ],
  },
  {
    collectionId: 'templates',
    indexes: [
      // List by owner: equal(ownerId).
      { key: 'owner', type: 'key', attributes: ['ownerId'], orders: ['asc'] },
    ],
  },
  {
    collectionId: 'catalog',
    indexes: [
      // List by owner + the duplicate-name check: equal(ownerId) + equal(name).
      {
        key: 'owner_name',
        type: 'key',
        attributes: ['ownerId', 'name'],
        orders: ['asc', 'asc'],
      },
    ],
  },
  {
    collectionId: 'stats',
    indexes: [
      // The dashboard's single-row-per-owner lookup: equal(ownerId).
      { key: 'owner', type: 'key', attributes: ['ownerId'], orders: ['asc'] },
    ],
  },
];

const args = process.argv.slice(2);
const confirmed = args.includes('--yes');

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

if (!apiKey) {
  fail(
    'APPWRITE_API_KEY belum diisi.\n' +
      '  1. Appwrite Console → project ini → Settings → API keys → Create\n' +
      '  2. Centang scope: collections.read, collections.write\n' +
      '  3. Tambahkan ke .env: APPWRITE_API_KEY=key_...',
  );
}

async function api(method, path, body) {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(`${endpoint}${path}`, {
      method,
      headers: {
        'X-Appwrite-Project': projectId,
        'X-Appwrite-Key': apiKey,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 429 && attempt < 6) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * attempt;
      console.log(`  rate-limited, tunggu ${Math.round(waitMs / 1000)}s…`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    if (!response.ok) {
      const text = (await response.text()).slice(0, 200).replace(/\s+/g, ' ');
      throw new Error(`${method} ${path} → ${response.status} ${text}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }
}

console.log(`Target: ${endpoint}  project=${projectId}  database=${databaseId}\n`);

try {
  let created = 0;
  let existing = 0;

  for (const { collectionId, indexes } of DESIRED) {
    const collection = await api(
      'GET',
      `/databases/${databaseId}/collections/${encodeURIComponent(collectionId)}`,
    );
    const present = new Set((collection?.indexes ?? []).map((index) => index.key));

    for (const index of indexes) {
      const label = `${collectionId}.${index.key} (${index.type}: ${index.attributes.join(', ')})`;
      if (present.has(index.key)) {
        console.log(`  ✓ ada      ${label}`);
        existing += 1;
        continue;
      }
      if (!confirmed) {
        console.log(`  + buat     ${label}`);
        created += 1;
        continue;
      }
      const result = await api(
        'POST',
        `/databases/${databaseId}/collections/${encodeURIComponent(collectionId)}/indexes`,
        index,
      );
      console.log(`  ✔ dibuat   ${label} — status ${result?.status ?? 'unknown'}`);
      created += 1;
    }
  }

  console.log(`\n${existing} index sudah ada, ${created} ${confirmed ? 'dibuat' : 'akan dibuat'}.`);
  if (!confirmed) {
    console.log('Dry-run saja. Ulangi dengan `--yes` untuk benar-benar membuat.');
    process.exit(0);
  }
  console.log('Index baru masih `processing` sebentar; query tetap jalan sambil menunggu.');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('401') || message.includes('403')) {
    fail(
      `API key ditolak (${message.slice(0, 120)}…).\n` +
        '  Pastikan key punya scope: collections.read, collections.write',
    );
  }
  fail(message);
}

console.log('\nSelesai. Sekarang cabut (revoke) API key-nya di Console → Settings → API keys.');
