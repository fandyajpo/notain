#!/usr/bin/env node
/**
 * Adds the payment-proof columns the customer upload flow expects:
 *
 *   invoices.paymentProofKey        — string128, nullable. R2 key of the
 *                                     uploaded proof (`proofs_<invoiceId>_
 *                                     <hex>.<ext>`); `null` until a customer
 *                                     uploads one. Written only by the public
 *                                     upload endpoint — a draft save never
 *                                     touches it.
 *   invoices.paymentProofUploadedAt — string32, nullable. ISO timestamp of
 *                                     the upload, for the "Dikirim …" copy in
 *                                     the owner's views.
 *
 * No index: the proof is read straight off the row, never queried by.
 *
 * Idempotent: re-running skips anything that already exists.
 *
 * Admin-only, so it needs an API key (Settings → API keys) with:
 *   collections.read, collections.write
 *
 * Put the key in `.env` as `APPWRITE_API_KEY=` (git-ignored — never commit it,
 * never paste it in chat). Revoke the key when you are done.
 *
 * Usage:
 *   node scripts/ensure-payment-proof.mjs          # dry-run
 *   node scripts/ensure-payment-proof.mjs --yes    # apply
 */

const databaseId = process.env.PUBLIC_APPWRITE_DATABASE_ID ?? 'notain_db';
const endpoint = (
  process.env.PUBLIC_APPWRITE_ENDPOINT ?? 'https://sgp.cloud.appwrite.io/v1'
).replace(/\/+$/, '');
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID ?? '6aca66fb003071c0ef43';
const apiKey = (process.env.APPWRITE_API_KEY ?? '').trim();

/**
 * Columns to ensure. Sizes mirror what each payload can hold: the R2 key is
 * `proofs_`(7) + invoice id(≤64) + `_` + 14 hex + `.` + ext(≤4) ≈ 91, the
 * timestamp is an ISO string.
 */
const TARGETS = [
  { tableId: 'invoices', column: { key: 'paymentProofKey', size: 128 } },
  { tableId: 'invoices', column: { key: 'paymentProofUploadedAt', size: 32 } },
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
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 2000 * attempt;
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
  for (const { tableId, column } of TARGETS) {
    const table = await api(
      'GET',
      `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}`,
    ).catch((error) => {
      if (String(error.message).includes('404')) {
        fail(`Tabel \`${tableId}\` tidak ada. Jalankan script ensure tabel itu dulu.`);
      }
      throw error;
    });

    const present = fieldsOf(table).some((field) => field.key === column.key);
    if (present) {
      console.log(`  ✓ kolom \`${tableId}.${column.key}\` sudah ada`);
      continue;
    }

    if (!confirmed) {
      console.log(
        `  + buat kolom \`${tableId}.${column.key}\` (string, size ${column.size}, nullable)`,
      );
      continue;
    }

    await api(
      'POST',
      `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}/attributes/string`,
      { key: column.key, size: column.size, required: false, array: false },
    );
    console.log(`  ✔ kolom \`${tableId}.${column.key}\` dibuat`);
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
        '  Pastikan key punya scope: collections.read, collections.write',
    );
  }
  fail(message);
}

console.log('\nSelesai. Sekarang cabut (revoke) API key-nya di Console → Settings → API keys.');
