#!/usr/bin/env node
/**
 * Adds the customer-email columns, if missing:
 *   1. `customers.email`  (string, size 255) — the directory column. Added by
 *      hand in the Console for the live project, ensured here so a fresh
 *      environment (local/staging) is not missing it.
 *   2. `invoices.customerEmail` (string, size 255) — the contact carried on
 *      each invoice, so the printed document and the Excel export keep the
 *      address the invoice was issued with.
 *
 * No backfill: both columns are optional. Old rows read back as "no email"
 * until an invoice is saved with one.
 *
 * Idempotent: re-running skips columns that already exist.
 *
 * Admin-only, so it needs an API key (Settings → API keys) with:
 *   collections.read, collections.write
 *
 * Put the key in `.env` as `APPWRITE_API_KEY=` (git-ignored — never commit it,
 * never paste it in chat). Revoke the key when you are done.
 *
 * Usage:
 *   node scripts/migrate-customer-email.mjs            # dry-run
 *   node scripts/migrate-customer-email.mjs --yes      # apply
 */

const databaseId = process.env.PUBLIC_APPWRITE_DATABASE_ID ?? 'notain_db';
const endpoint = (
  process.env.PUBLIC_APPWRITE_ENDPOINT ?? 'https://sgp.cloud.appwrite.io/v1'
).replace(/\/+$/, '');
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID ?? '6aca66fb003071c0ef43';
const apiKey = (process.env.APPWRITE_API_KEY ?? '').trim();

/** [table id, column key] — size is 255 for both, matching CUSTOMER_LIMITS.email. */
const COLUMNS = [
  { tableId: 'customers', key: 'email', size: 255 },
  { tableId: 'invoices', key: 'customerEmail', size: 255 },
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
    const options = {
      method,
      headers: {
        'X-Appwrite-Project': projectId,
        'X-Appwrite-Key': apiKey,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
    };
    // A GET carries no payload — Appwrite reads path + query only, and fetch
    // rejects a body on GET in some runtimes.
    if (method !== 'GET' && body) options.body = JSON.stringify(body);
    const response = await fetch(`${endpoint}${path}`, options);

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

console.log(`Target: ${endpoint}  project=${projectId}  database=${databaseId}\n`);

try {
  for (const column of COLUMNS) {
    const label = `${column.tableId}.${column.key}`;
    const collection = await api(
      'GET',
      `/databases/${databaseId}/collections/${encodeURIComponent(column.tableId)}`,
    );
    // Tables/DB may report `columns` or the legacy `attributes`; accept either.
    const fields = collection?.columns ?? collection?.attributes ?? [];
    const exists = fields.some((field) => field.key === column.key);

    if (exists) {
      console.log(`  ✓ kolom \`${label}\` sudah ada`);
      continue;
    }
    if (!confirmed) {
      console.log(`  + buat kolom \`${label}\` (string, size ${column.size})`);
      continue;
    }

    await api(
      'POST',
      `/databases/${databaseId}/collections/${encodeURIComponent(column.tableId)}/attributes/string`,
      { key: column.key, size: column.size, required: false, array: false },
    );
    console.log(`  ✔ kolom \`${label}\` dibuat`);
    // Give Appwrite a moment to propagate the new attribute.
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  if (!confirmed) {
    console.log('\nDry-run saja. Ulangi dengan `--yes` untuk benar-benar menerapkan.');
    process.exit(0);
  }
  console.log('\nSelesai.');
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
