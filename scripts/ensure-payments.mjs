#!/usr/bin/env node
/**
 * Creates the `payments` table (DOKU checkout orders for paid plans) if
 * missing.
 *
 * One row per checkout attempt:
 *   ownerId (string 64 — the Appwrite user id), plan (string 16 — 'pro' |
 *   'business'), amount (integer — whole IDR, copied from the server-side
 *   plan catalog at creation, never from the client), currency (string 8),
 *   status (string 16 — 'pending' | 'paid' | 'expired'), invoiceNumber
 *   (string 64 — DOKU's `order.invoice_number`, unique per merchant),
 *   checkoutUrl (string 1024 — the hosted checkout page, returned to the
 *   owner), dokuExpiredAt (string 32 — checkout page expiry, ISO), paidAt
 *   (string 32 — set from the verified notification, ISO), createdAt
 *   (string 32, ISO).
 *
 * Row permissions stay empty like `audit_logs`/`support`: only the Pages
 * Functions touch these rows via the API key (which bypasses rowSecurity).
 * The client never reads or writes payment rows directly — checkout status
 * reaches the owner only through `GET /api/payments/status`, which checks
 * the session and the row's ownerId.
 *
 * Indexes:
 *   byInvoiceNumber (unique) — the webhook looks the row up by DOKU's
 *     invoice_number; uniqueness also guarantees two checkouts can never
 *     share an order id.
 *   byOwnerStatus (ownerId, status) — "does this owner already have a
 *     pending checkout?" and the pending-count guard against duplicate
 *     submissions.
 *
 * Idempotent: re-running skips anything that already exists.
 *
 * Admin-only, so it needs an API key (Settings → API keys) with:
 *   collections.read, collections.write, documents.write
 *
 * Put the key in `.env` as `APPWRITE_API_KEY=` (git-ignored — never commit it,
 * never paste it in chat). Revoke the key when you are done.
 *
 * Usage:
 *   node scripts/ensure-payments.mjs            # dry-run
 *   node scripts/ensure-payments.mjs --yes      # apply
 */

const databaseId = process.env.PUBLIC_APPWRITE_DATABASE_ID ?? 'notain_db';
const endpoint = (
  process.env.PUBLIC_APPWRITE_ENDPOINT ?? 'https://sgp.cloud.appwrite.io/v1'
).replace(/\/+$/, '');
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID ?? '6aca66fb003071c0ef43';
const apiKey = (process.env.APPWRITE_API_KEY ?? '').trim();
const tableId = 'payments';

const STRING_ATTRIBUTES = [
  { key: 'ownerId', size: 64 },
  { key: 'plan', size: 16 },
  { key: 'currency', size: 8 },
  { key: 'status', size: 16 },
  { key: 'invoiceNumber', size: 64 },
  { key: 'checkoutUrl', size: 1024 },
  { key: 'dokuExpiredAt', size: 32 },
  { key: 'paidAt', size: 32 },
  { key: 'createdAt', size: 32 },
];

const INTEGER_ATTRIBUTES = [
  // Whole IDR; 12 digits is DOKU's documented max order.amount length.
  { key: 'amount', min: 0, max: 999_999_999_999 },
];

const INDEXES = [
  { key: 'byInvoiceNumber', type: 'unique', attributes: ['invoiceNumber'], orders: ['asc'] },
  { key: 'byOwnerStatus', type: 'key', attributes: ['ownerId', 'status'], orders: ['asc', 'asc'] },
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
      '  2. Centang scope: collections.read, collections.write, documents.write\n' +
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

/** Appwrite reports either `columns` or the legacy `attributes`; accept both. */
function fieldsOf(collection) {
  return collection?.columns ?? collection?.attributes ?? [];
}

console.log(`Target: ${endpoint}  project=${projectId}  database=${databaseId}\n`);

try {
  // 1. The table itself.
  let table;
  try {
    table = await api('GET', `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}`);
    console.log(`  ✓ tabel \`${tableId}\` sudah ada`);
  } catch (error) {
    if (!String(error.message).includes('404')) throw error;
    if (!confirmed) {
      console.log(`  + buat tabel \`${tableId}\` (rowSecurity, permissions kosong)`);
      for (const attribute of [...STRING_ATTRIBUTES, ...INTEGER_ATTRIBUTES]) {
        console.log(`  + buat kolom \`${tableId}.${attribute.key}\``);
      }
      for (const index of INDEXES) {
        console.log(`  + buat index \`${tableId}.${index.key}\` (${index.attributes.join(', ')})`);
      }
      console.log('\nDry-run saja. Ulangi dengan `--yes` untuk benar-benar menerapkan.');
      process.exit(0);
    }
    table = await api('POST', `/databases/${databaseId}/collections`, {
      collectionId: tableId,
      name: 'Payments',
      // Table-level permissions stay empty: only the API key writes (it
      // bypasses rowSecurity) after the session + DOKU checks pass.
      permissions: [],
      rowSecurity: true,
    });
    console.log(`  ✔ tabel \`${tableId}\` dibuat`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  // 2. Attributes.
  table =
    table ??
    (await api('GET', `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}`));
  const present = new Set(fieldsOf(table).map((field) => field.key));

  for (const attribute of STRING_ATTRIBUTES) {
    if (present.has(attribute.key)) {
      console.log(`  ✓ kolom \`${tableId}.${attribute.key}\` sudah ada`);
      continue;
    }
    if (!confirmed) {
      console.log(
        `  + buat kolom \`${tableId}.${attribute.key}\` (string, size ${attribute.size})`,
      );
      continue;
    }
    await api(
      'POST',
      `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}/attributes/string`,
      { key: attribute.key, size: attribute.size, required: false, array: false },
    );
    console.log(`  ✔ kolom \`${tableId}.${attribute.key}\` dibuat`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  for (const attribute of INTEGER_ATTRIBUTES) {
    if (present.has(attribute.key)) {
      console.log(`  ✓ kolom \`${tableId}.${attribute.key}\` sudah ada`);
      continue;
    }
    if (!confirmed) {
      console.log(`  + buat kolom \`${tableId}.${attribute.key}\` (integer)`);
      continue;
    }
    await api(
      'POST',
      `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}/attributes/integer`,
      { key: attribute.key, required: false, min: attribute.min, max: attribute.max, array: false },
    );
    console.log(`  ✔ kolom \`${tableId}.${attribute.key}\` dibuat`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  // 3. Indexes (on the fresh table so creation races don't read stale state).
  const freshTable = await api(
    'GET',
    `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}`,
  );
  const indexes = new Set((freshTable?.indexes ?? []).map((index) => index.key));
  for (const index of INDEXES) {
    if (indexes.has(index.key)) {
      console.log(`  ✓ index \`${tableId}.${index.key}\` sudah ada`);
      continue;
    }
    if (!confirmed) {
      console.log(`  + buat index \`${tableId}.${index.key}\` (${index.attributes.join(', ')})`);
      continue;
    }
    await api(
      'POST',
      `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}/indexes`,
      index,
    );
    console.log(`  ✔ index \`${tableId}.${index.key}\` dibuat`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  if (!confirmed) {
    console.log('\nDry-run saja. Ulangi dengan `--yes` untuk benar-benar menerapkan.');
    process.exit(0);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('401') || message.includes('403')) {
    fail(
      `API key ditolak (${message.slice(0, 120)}…).\n` +
        '  Pastikan key punya scope: collections.read, collections.write, documents.write',
    );
  }
  fail(message);
}

console.log('\nSelesai. Sekarang cabut (revoke) API key-nya di Console → Settings → API keys.');
