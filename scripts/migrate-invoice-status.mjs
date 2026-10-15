#!/usr/bin/env node
/**
 * Adds the `status` column to the `invoices` table and backfills existing rows.
 *
 * The invoice lifecycle status (sent / paid / void) is a new string column.
 * This script:
 *   1. Creates the column if it is missing (string, size 8, default "sent").
 *   2. Walks every invoice and stamps "sent" on rows where status is empty,
 *      so invoices saved before the column existed read back cleanly.
 *
 * Idempotent: re-running skips the column if present and only touches rows
 * still missing a status.
 *
 * Admin-only, so it needs an API key (Settings → API keys) with:
 *   collections.read, collections.write, documents.read, documents.write
 *
 * Put the key in `.env` as `APPWRITE_API_KEY=` (git-ignored — never commit it,
 * never paste it in chat). Revoke the key when you are done.
 *
 * Usage:
 *   node scripts/migrate-invoice-status.mjs            # dry-run
 *   node scripts/migrate-invoice-status.mjs --yes      # apply
 */

const databaseId = process.env.PUBLIC_APPWRITE_DATABASE_ID ?? 'notain_db';
const endpoint = (
  process.env.PUBLIC_APPWRITE_ENDPOINT ?? 'https://sgp.cloud.appwrite.io/v1'
).replace(/\/+$/, '');
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID ?? '6aca66fb003071c0ef43';
const apiKey = (process.env.APPWRITE_API_KEY ?? '').trim();
const tableId = 'invoices';
const PAGE_LIMIT = 100;

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
      '  2. Centang scope: collections.read, collections.write, documents.read, documents.write\n' +
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
      const text = (await response.text()).slice(0, 300).replace(/\s+/g, ' ');
      throw new Error(`${method} ${path} → ${response.status} ${text}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }
}

/** Appwrite REST queries are JSON objects at numeric keys. */
function documentsQuery(cursorAfter) {
  const params = new URLSearchParams();
  params.set('0', JSON.stringify({ method: 'limit', attribute: null, values: [PAGE_LIMIT] }));
  if (cursorAfter) {
    params.set(
      '1',
      JSON.stringify({ method: 'cursorAfter', attribute: null, values: [cursorAfter] }),
    );
  }
  return params.toString();
}

console.log(`Target: ${endpoint}  project=${projectId}  database=${databaseId}  table=${tableId}\n`);

try {
  // 1. Ensure the column exists.
  const collection = await api(
    'GET',
    `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}`,
  );
  // Tables/DB may report `columns` or the legacy `attributes`; accept either.
  const fields = collection?.columns ?? collection?.attributes ?? [];
  const hasStatus = fields.some((field) => field.key === 'status');

  if (hasStatus) {
    console.log('  ✓ kolom `status` sudah ada');
  } else if (!confirmed) {
    console.log('  + buat kolom `status` (string, size 8, default "sent")');
  } else {
    await api(
      'POST',
      `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}/attributes/string`,
      { key: 'status', size: 8, required: false, default: 'sent', array: false },
    );
    console.log('  ✔ kolom `status` dibuat');
    // Give Appwrite a moment to propagate the new attribute before backfilling.
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // 2. Backfill rows where status is empty. We cannot filter on an empty column
  // server-side without an index, so we walk every row and check locally.
  let cursorAfter;
  let backfilled = 0;
  let scanned = 0;

  for (let page = 0; page < 100; page += 1) {
    const response = await api(
      'GET',
      `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}/documents?${documentsQuery(cursorAfter)}`,
    );

    const rows = response?.documents ?? [];
    scanned += rows.length;

    for (const row of rows) {
      if (typeof row.status === 'string' && row.status !== '') continue;
      if (!confirmed) {
        backfilled += 1;
        continue;
      }
      await api(
        'PATCH',
        `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}/documents/${encodeURIComponent(row.$id)}`,
        { data: { status: 'sent' } },
      );
      backfilled += 1;
    }

    const last = rows.at(-1);
    if (rows.length < PAGE_LIMIT || !last) break;
    cursorAfter = last.$id;
  }

  console.log(
    `\n${scanned} baris dipindai, ${backfilled} ${confirmed ? 'di-backfill' : 'akan di-backfill'}.`,
  );
  if (!confirmed) {
    console.log('Dry-run saja. Ulangi dengan `--yes` untuk benar-benar menerapkan.');
    process.exit(0);
  }
  console.log('Selesai.');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('401') || message.includes('403')) {
    fail(
      `API key ditolak (${message.slice(0, 120)}…).\n` +
        '  Pastikan key punya scope: collections.read, collections.write, documents.read, documents.write',
    );
  }
  fail(message);
}

console.log('\nSelesai. Sekarang cabut (revoke) API key-nya di Console → Settings → API keys.');
